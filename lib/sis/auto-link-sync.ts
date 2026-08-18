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
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';
import { resolveOneRosterConnection } from '@/lib/sis/connections';
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
 * the debounce reads the same audit trail — and completed NO-OP runs leave a
 * marker as well (below), so an import burst in an already-current district
 * still costs the SIS one walk, not one per import (PR #895 review).
 *
 * Three minutes, not ten: a provider whose import lands just after another
 * run finished waits at most this long for the next trigger to take — the
 * guide says links appear "shortly after" an import, and a ten-minute hole
 * would make that claim quietly false (PR #895 review).
 */
export const AUTO_LINK_DEBOUNCE_MINUTES = 3;

/** The no-write debounce marker; applied runs are marked by the engine. */
const ATTEMPT_AUDIT_ACTION = 'sis_link_sync_attempted';
const APPLY_AUDIT_ACTION = 'sis_link_sync_applied';

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
    // Shared with the district-admin gate (SPE-545): one definition of "this
    // district has a dialable OneRoster setup" for attended and unattended
    // paths alike.
    const resolved = await resolveOneRosterConnection(districtId);
    if (resolved.status === 'load-failed') {
      log.error('Auto link sync could not resolve the connection', undefined, {
        districtId,
        trigger,
        phase: resolved.phase,
      });
      return 'failed';
    }
    if (resolved.status !== 'connected') {
      // Most districts simply have no SIS wired up — routine, not an error.
      log.info('Auto link sync skipped: no usable OneRoster connection', {
        districtId,
        trigger,
        reason: resolved.status,
      });
      return 'no-connection';
    }
    const { connection, credential } = resolved;

    // Debounce on the audit trail rather than new state: applies mark
    // themselves (`sis_link_sync_applied`, written by the engine — manual,
    // import, and cron alike), and completed NO-OP runs leave an
    // `sis_link_sync_attempted` marker below, so an already-current district
    // debounces too. A failed read proceeds: the debounce is SIS courtesy,
    // not a safety rail, and a broken read must not silently stop the
    // nightly.
    try {
      const since = new Date(Date.now() - AUTO_LINK_DEBOUNCE_MINUTES * 60_000).toISOString();
      const { data: recent, error: recentError } = await createServiceClient()
        .from('audit_logs')
        .select('id')
        .in('action', [APPLY_AUDIT_ACTION, ATTEMPT_AUDIT_ACTION])
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
        log.info('Auto link sync debounced: a run completed within the window', {
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

    // The debounce marker for runs that end without writing. Failed runs are
    // deliberately NOT marked — a transient SIS failure retrying on the next
    // trigger is wanted behavior. Best-effort by the audit writer's design.
    const markAttempt = async (outcome: 'refused' | 'nothing-to-do') => {
      await logServerAuditEvent({
        user_id: actorId,
        action: ATTEMPT_AUDIT_ACTION,
        resource_type: 'district_sis_connection',
        resource_id: connection.id,
        metadata: { districtId: connection.district_id, trigger, outcome },
      });
    };

    const plan = planStudentTeacherLinkSync(input);
    if (plan.refusal) {
      // The engine's mass-delete rails saying no — by design this is the
      // nightly quietly waiting out a partially updated feed, not a failure.
      log.warn('Auto link sync refused by the planner; nothing written', {
        connectionId: connection.id,
        trigger,
        plan: linkPlanCounts(plan),
      });
      await markAttempt('refused');
      return 'refused';
    }
    if (writableLinkChangeCount(plan) === 0) {
      log.info('Auto link sync: nothing to write', {
        connectionId: connection.id,
        trigger,
        plan: linkPlanCounts(plan),
      });
      await markAttempt('nothing-to-do');
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
