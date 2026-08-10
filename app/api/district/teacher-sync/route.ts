import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getDecryptedCredential, listConnections } from '@/lib/sis/connections';
import {
  applyTeacherSyncPlan,
  loadTeacherSyncInput,
  planCounts,
  planTeacherDirectorySync,
} from '@/lib/sis/teacher-directory-sync';

const log = logger.child({ module: 'district-teacher-sync' });

const bodySchema = z
  .object({
    mode: z.enum(['dry-run', 'apply']),
    /** Apply only: the writable count from the preview the admin reviewed. */
    expectedChanges: z.number().int().min(0).optional(),
  })
  .refine((b) => b.mode !== 'apply' || b.expectedChanges !== undefined, {
    message: 'apply requires expectedChanges from the reviewed preview',
  });

/**
 * POST /api/district/teacher-sync — the district admin's own Preview → Apply
 * for the teacher-directory sync (SPE-438; moved out of /internal per the
 * owner's 2026-08-10 direction — "a district admin making this call", with
 * site-admin delegation as the eventual shape).
 *
 * Same engine as the internal route, different authorization: the caller's
 * OWN district only, resolved from their grants — a request can never name a
 * district or a connection. DISTRICT ADMINS ONLY: the shared seam admits
 * `district_tech` too, which is right for connection management and wrong
 * here twice over — this surface serves teacher PII and, on apply, PROVISIONS
 * SIGN-IN ACCOUNTS. Same one-more-look grant re-check as the sis-directory
 * route (SPE-436).
 *
 * Apply recomputes the plan server-side and is count-bound to the reviewed
 * preview (409 on drift). Logs stay counts-only; row detail exists only in
 * the response for the reviewing admin.
 */
export const POST = withRoute<Record<string, string>, z.infer<typeof bodySchema>>(
  {
    body: bodySchema,
    // Every run walks full pagination against the district's production SIS,
    // and apply provisions accounts on top — keep the ceiling low.
    rateLimit: { requests: 4, windowSeconds: 60, name: 'district-teacher-sync' },
  },
  async ({ userId, body }) => {
    const caller = await resolveDistrictSisCaller(userId);
    if (!caller.ok) {
      log.warn('Non-district-admin tried the teacher sync', { userId, denied: caller.denied });
      return NextResponse.json(
        { error: 'Forbidden: district admin access required' },
        { status: 403 },
      );
    }
    if (caller.role !== 'district_admin') {
      const { data: adminGrant } = await createServiceClient()
        .from('admin_permissions')
        .select('id')
        .eq('admin_id', userId)
        .eq('role', 'district_admin')
        .eq('district_id', caller.districtId)
        .limit(1)
        .maybeSingle();
      if (!adminGrant) {
        log.warn('district_tech tried the teacher sync', {
          userId,
          districtId: caller.districtId,
        });
        return NextResponse.json(
          { error: 'Forbidden: the teacher sync is for district admins.' },
          { status: 403 },
        );
      }
    }

    // Wrapped: withRoute's catch echoes error.message to the client in
    // development, and a Supabase error names tables and constraints.
    let connections;
    try {
      connections = await listConnections(caller.districtId);
    } catch (err) {
      log.error('Failed to load SIS connections for the teacher sync', err, {
        districtId: caller.districtId,
      });
      return NextResponse.json({ error: 'Could not load your connection.' }, { status: 500 });
    }

    const connection = connections.find((c) => c.sis_type === 'oneroster');
    if (!connection || !connection.base_url) {
      return NextResponse.json(
        { error: 'Teacher sync needs a OneRoster connection. Set one up in the tech portal first.' },
        { status: 409 },
      );
    }

    let credential: Awaited<ReturnType<typeof getDecryptedCredential>> = null;
    try {
      credential = await getDecryptedCredential(connection.id);
    } catch (err) {
      log.error('Could not decrypt the stored SIS credential', err, {
        connectionId: connection.id,
      });
      return NextResponse.json(
        { error: 'Your stored OneRoster credential could not be read. Re-save it in the tech portal.' },
        { status: 500 },
      );
    }
    if (!credential || credential.sisType !== 'oneroster') {
      return NextResponse.json(
        { error: 'No OneRoster credentials are stored yet, so there is nothing to sync.' },
        { status: 409 },
      );
    }

    const input = await loadTeacherSyncInput({
      districtId: connection.district_id,
      baseUrl: connection.base_url,
      tokenUrl: connection.token_url,
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
    });
    const plan = planTeacherDirectorySync(input);

    log.info('Teacher directory sync planned by district admin', {
      connectionId: connection.id,
      districtId: connection.district_id,
      actorId: userId,
      mode: body.mode,
      plan: planCounts(plan),
    });

    if (body.mode === 'dry-run') {
      return NextResponse.json({ mode: 'dry-run', plan });
    }

    // The approval boundary, same as the internal route: apply is bound to
    // the count the admin confirmed; drift refuses and asks for a re-preview.
    const writable = plan.schools
      .filter((s) => !s.refusal)
      .reduce((sum, s) => sum + s.creates.length + s.adopts.length + s.updates.length, 0);
    if (writable !== body.expectedChanges) {
      log.info('Teacher sync apply refused: the plan moved since the preview', {
        connectionId: connection.id,
        expected: body.expectedChanges,
        recomputed: writable,
      });
      return NextResponse.json(
        {
          error:
            `Your district's data changed since the preview (${body.expectedChanges} ` +
            `change(s) approved, ${writable} now planned). Nothing was written — run the preview again.`,
        },
        { status: 409 },
      );
    }

    const written = await applyTeacherSyncPlan({
      plan,
      actorId: userId,
      connectionId: connection.id,
      districtId: connection.district_id,
    });
    return NextResponse.json({ mode: 'apply', plan, written });
  },
);
