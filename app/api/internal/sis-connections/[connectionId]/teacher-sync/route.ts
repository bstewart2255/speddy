import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { speddyAdminDenialReason } from '@/lib/api/speddy-admin-denial-reason';
import { logger } from '@/lib/logger';
import { getConnection, getDecryptedCredential } from '@/lib/sis/connections';
import {
  applyTeacherSyncPlan,
  loadTeacherSyncInput,
  planCounts,
  planTeacherDirectorySync,
} from '@/lib/sis/teacher-directory-sync';

const log = logger.child({ module: 'internal-teacher-sync' });

const bodySchema = z
  .object({
    mode: z.enum(['dry-run', 'apply']),
    /**
     * Apply only: the writable-change count from the dry-run the operator
     * reviewed. Apply recomputes the plan from a fresh feed read; if the
     * recomputed plan would write a DIFFERENT number of changes than the one
     * approved, the route refuses with 409 and the operator re-previews.
     * Count-level rather than a full plan digest — proportionate for a
     * staff-clicked concierge surface (Codex/CodeRabbit, PR #831).
     */
    expectedChanges: z.number().int().min(0).optional(),
  })
  .refine((b) => b.mode !== 'apply' || b.expectedChanges !== undefined, {
    message: 'apply requires expectedChanges from the reviewed preview',
  });

/**
 * POST /api/internal/sis-connections/[connectionId]/teacher-sync — plan (and,
 * on `mode: 'apply'`, execute) the OneRoster teacher-directory sync (SPE-437).
 *
 * Staff-gated like the connection test (SPE-427): this dials a district's SIS
 * with their stored credential, so the gate must refuse BEFORE anything is
 * dialled — the handler tests pin that, not just the 403.
 *
 * `apply` recomputes the plan server-side from a fresh feed read. The client
 * never posts a plan back; a stale or tampered browser payload therefore
 * cannot write anything the current feed does not support. The cost is one
 * extra fetch pass, which for a staff-clicked concierge flow is the right
 * trade.
 *
 * The response carries teacher directory rows (names, work emails, staff
 * IDs) for the reviewing human — the same fields the district admin already
 * sees in the SPE-436 Directories view. Logs stay counts-only. No student
 * data is read from the SIS at all.
 */
export const POST = withRoute<{ connectionId: string }, z.infer<typeof bodySchema>>(
  {
    body: bodySchema,
    // Each run walks full pagination against a school district's production
    // server, and apply runs the walk again — keep the ceiling low.
    rateLimit: { requests: 4, windowSeconds: 60, name: 'internal-teacher-sync' },
  },
  async ({ userId, params, body }) => {
    const denied = await speddyAdminDenialReason(userId);
    if (denied) {
      log.warn('Non-speddy-admin tried to run the teacher sync', {
        userId,
        connectionId: params.connectionId,
        denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: Speddy admin access required' },
        { status: 403 },
      );
    }

    // Wrapped: withRoute's catch echoes error.message to the client in
    // development, and a Supabase error names tables and constraints.
    let connection;
    try {
      connection = await getConnection(params.connectionId);
    } catch (err) {
      log.error('Failed to load the SIS connection', err, {
        connectionId: params.connectionId,
      });
      return NextResponse.json({ error: 'Could not load that connection.' }, { status: 500 });
    }
    if (!connection) {
      return NextResponse.json({ error: 'No such SIS connection.' }, { status: 404 });
    }
    if (connection.sis_type !== 'oneroster') {
      return NextResponse.json(
        { error: 'Teacher sync reads the OneRoster connection; this one is not it.' },
        { status: 409 },
      );
    }
    if (!connection.base_url) {
      return NextResponse.json(
        { error: 'This connection has no address saved, so there is nothing to sync from.' },
        { status: 409 },
      );
    }

    let credential: Awaited<ReturnType<typeof getDecryptedCredential>> = null;
    try {
      credential = await getDecryptedCredential(connection.id);
    } catch (err) {
      // Distinct from "not stored yet": telling an operator to have the
      // district re-enter credentials that exist hides an operational fault
      // (likely a key rotation) behind setup guidance — same split the
      // SPE-436 directory route makes.
      log.error('Could not decrypt the stored SIS credential', err, {
        connectionId: connection.id,
      });
      return NextResponse.json(
        {
          error:
            'The stored OneRoster credential could not be decrypted. Check the encryption key — re-entering credentials is not the fix.',
        },
        { status: 500 },
      );
    }
    if (!credential || credential.sisType !== 'oneroster') {
      return NextResponse.json(
        { error: 'This district has no OneRoster credentials stored, so there is nothing to sync.' },
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

    // Counts only — this line, not the panel, is what outlives the session.
    log.info('Teacher directory sync planned', {
      connectionId: connection.id,
      districtId: connection.district_id,
      actorId: userId,
      mode: body.mode,
      plan: planCounts(plan),
    });

    if (body.mode === 'dry-run') {
      return NextResponse.json({ mode: 'dry-run', plan });
    }

    // The approval boundary: what the operator confirmed was the PREVIEW's
    // writable count. The feed may have moved since; writing a different
    // change set under a confirmation for the old one is the one thing apply
    // must not do. Count mismatch → nothing written, re-preview.
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
            `The district's data changed since your preview (${body.expectedChanges} ` +
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
