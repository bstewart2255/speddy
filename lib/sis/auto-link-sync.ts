/**
 * Unattended runs of the class-roster link sync (SPE-545).
 *
 * Two triggers, one function: right after a provider imports students (so a
 * secondary caseload sees its teachers within a minute, not tomorrow), and
 * nightly as the backstop that tracks schedule changes and late data fixes.
 * Owner decision 2026-08-18: LINKS ONLY — the teacher sync stays a human
 * click, because its apply mints sign-in accounts and new-teacher review
 * should keep a human in it for now.
 *
 * Safe unattended BY INHERITANCE, not by hope: the SPE-540 engine refuses
 * whole runs against empty or half-updated feeds, never writes a human's
 * link, never diffs an unmatched child, and holds removals for any child
 * whose roster teachers didn't all resolve. This module adds only plumbing:
 * connection resolution, a debounce, and the never-throw contract its
 * callers (a post-response hook and a cron ride-along) depend on.
 *
 * PRIVACY: same bar as the engine — everything logged here is counts and
 * fixed words.
 *
 * Server-only: dials an external SIS with a decrypted credential.
 */
import { logger } from '@/lib/logger';
import { createServiceClient } from '@/lib/supabase/server';
import { getDecryptedCredential, listConnections } from '@/lib/sis/connections';
import {
  applyLinkSyncPlan,
  linkPlanCounts,
  loadLinkSyncInput,
  planStudentTeacherLinkSync,
  writableLinkChangeCount,
} from './student-teacher-link-sync';

const log = logger.child({ module: 'auto-link-sync' });

/**
 * Two runs inside this window collapse to one. Manual applies count too —
 * the debounce reads the same audit trail every apply writes — so five
 * providers importing in one afternoon cost the district's SIS one walk,
 * and an admin who JUST clicked Apply doesn't get an echo run.
 */
export const AUTO_LINK_DEBOUNCE_MINUTES = 10;

export type AutoLinkOutcome =
  | 'applied'
  | 'nothing-to-do'
  | 'refused'
  | 'debounced'
  | 'no-connection'
  | 'failed';

/**
 * Run the link sync for one district without a human watching.
 *
 * NEVER THROWS — both callers run where an exception would do damage out of
 * all proportion (fail a provider's just-completed import response, or kill
 * the shared cron's other jobs). Every path returns an outcome word and
 * leaves a counts-only log line; applied runs leave the same audit record a
 * manual apply does, stamped with the trigger.
 */
export async function runAutoLinkSync(params: {
  districtId: string;
  trigger: 'import' | 'cron';
  /** The importing provider for 'import' runs; null for 'cron'. */
  actorId: string | null;
}): Promise<AutoLinkOutcome> {
  const { districtId, trigger, actorId } = params;
  try {
    let connections;
    try {
      connections = await listConnections(districtId);
    } catch (err) {
      log.error('Auto link sync could not load connections', err, { districtId, trigger });
      return 'failed';
    }
    const connection = connections.find((c) => c.sis_type === 'oneroster');
    if (!connection || !connection.base_url) {
      // Most districts simply have no SIS wired up — routine, not an error.
      log.info('Auto link sync skipped: no OneRoster connection', { districtId, trigger });
      return 'no-connection';
    }

    let credential;
    try {
      credential = await getDecryptedCredential(connection.id);
    } catch (err) {
      log.error('Auto link sync could not decrypt the stored credential', err, {
        connectionId: connection.id,
        trigger,
      });
      return 'failed';
    }
    if (!credential || credential.sisType !== 'oneroster') {
      log.info('Auto link sync skipped: no stored OneRoster credential', {
        connectionId: connection.id,
        trigger,
      });
      return 'no-connection';
    }

    // Debounce on the audit trail rather than new state: every apply —
    // manual, import, cron — records `sis_link_sync_applied` against the
    // connection, so "ran recently" needs no schema and cannot drift from
    // the truth. A failed read proceeds: the debounce is SIS courtesy, not
    // a safety rail, and a broken read must not silently stop the nightly.
    try {
      const since = new Date(Date.now() - AUTO_LINK_DEBOUNCE_MINUTES * 60_000).toISOString();
      const { data: recent, error: recentError } = await createServiceClient()
        .from('audit_logs')
        .select('id')
        .eq('action', 'sis_link_sync_applied')
        .eq('resource_id', connection.id)
        .gte('timestamp', since)
        .limit(1);
      if (recentError) {
        log.warn('Auto link sync debounce read failed; proceeding', {
          connectionId: connection.id,
          trigger,
          reason: recentError.message,
        });
      } else if ((recent ?? []).length > 0) {
        log.info('Auto link sync debounced: a run applied within the window', {
          connectionId: connection.id,
          trigger,
        });
        return 'debounced';
      }
    } catch (err) {
      log.warn('Auto link sync debounce read threw; proceeding', {
        connectionId: connection.id,
        trigger,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }

    let input;
    try {
      input = await loadLinkSyncInput({
        districtId: connection.district_id,
        baseUrl: connection.base_url,
        tokenUrl: connection.token_url,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
      });
    } catch (err) {
      log.error('Auto link sync could not read the SIS', err, {
        connectionId: connection.id,
        trigger,
      });
      return 'failed';
    }

    const plan = planStudentTeacherLinkSync(input);
    if (plan.refusal) {
      // The engine's mass-delete rails saying no — by design this is the
      // nightly quietly waiting out a partially updated feed, not a failure.
      log.warn('Auto link sync refused by the planner; nothing written', {
        connectionId: connection.id,
        trigger,
        plan: linkPlanCounts(plan),
      });
      return 'refused';
    }
    if (writableLinkChangeCount(plan) === 0) {
      log.info('Auto link sync: nothing to write', {
        connectionId: connection.id,
        trigger,
        plan: linkPlanCounts(plan),
      });
      return 'nothing-to-do';
    }

    try {
      await applyLinkSyncPlan({
        plan,
        actorId,
        connectionId: connection.id,
        districtId: connection.district_id,
        trigger,
      });
      return 'applied';
    } catch (err) {
      // The engine already audited the partial outcome; this line is the
      // operator-facing pointer.
      log.error('Auto link sync apply failed partway', err, {
        connectionId: connection.id,
        trigger,
      });
      return 'failed';
    }
  } catch (err) {
    // Belt over the per-step suspenders: no path out of here may throw.
    log.error('Auto link sync failed unexpectedly', err, { districtId, trigger });
    return 'failed';
  }
}

/**
 * Every district with a OneRoster connection — the nightly's worklist.
 * Distinct + sorted so the ride-along's run order is deterministic.
 */
export async function listAutoSyncDistrictIds(): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from('district_sis_connections')
    .select('district_id')
    .eq('sis_type', 'oneroster');
  if (error) throw new Error(`Could not list SIS connections: ${error.message}`);
  return [...new Set((data ?? []).map((r) => String(r.district_id)))].sort();
}
