import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { requireDistrictAdminOneRoster } from '@/lib/api/district-oneroster-gate';
import { logger } from '@/lib/logger';
import {
  applyTeacherSyncPlan,
  loadTeacherSyncInput,
  planCounts,
  planTeacherDirectorySync,
  writableChangeCount,
} from '@/lib/sis/teacher-directory-sync';

// Full SIS pagination twice on apply, plus one-at-a-time account provisioning:
// well past the platform's default function window. Matches the ceiling the
// other long-running SIS routes use.
export const maxDuration = 300;

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
 * district or a connection. DISTRICT ADMINS ONLY: this surface serves teacher
 * PII and, on apply, PROVISIONS SIGN-IN ACCOUNTS, both beyond the tech role's
 * integrations-only line. The whole admission ladder lives in
 * `requireDistrictAdminOneRoster` (SPE-540), shared with the link-sync route.
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
    const gate = await requireDistrictAdminOneRoster(userId, {
      logLabel: 'teacher sync',
      adminOnlyMessage: 'Forbidden: the teacher sync is for district admins.',
      noConnectionMessage:
        'Teacher sync needs a OneRoster connection. Set one up in the tech portal first.',
    });
    if (!gate.ok) return gate.response;
    const { connection, credential } = gate;

    // Wrapped like the other outbound calls: withRoute's dev-mode catch
    // echoes error.message, and a SIS failure's text can carry the base URL
    // or upstream response fragments a district admin should not see.
    let input;
    try {
      input = await loadTeacherSyncInput({
        districtId: connection.district_id,
        baseUrl: connection.base_url,
        tokenUrl: connection.token_url,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
      });
    } catch (err) {
      log.error('Reading the district SIS for the teacher sync failed', err, {
        connectionId: connection.id,
        districtId: connection.district_id,
      });
      return NextResponse.json(
        { error: 'Your SIS did not answer completely. Nothing was written — try again in a moment.' },
        { status: 502 },
      );
    }
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
    const writable = writableChangeCount(plan);
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
