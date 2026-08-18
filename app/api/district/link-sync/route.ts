import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { requireDistrictAdminOneRoster } from '@/lib/api/district-oneroster-gate';
import { logger } from '@/lib/logger';
import {
  applyLinkSyncPlan,
  linkPlanCounts,
  loadLinkSyncInput,
  planStudentTeacherLinkSync,
  writableLinkChangeCount,
} from '@/lib/sis/student-teacher-link-sync';

// Three full SIS collections walked per run (students, enrollments, classes),
// twice on apply — same ceiling as the other long-running SIS routes.
export const maxDuration = 300;

const log = logger.child({ module: 'district-link-sync' });

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
 * POST /api/district/link-sync — the district admin's Preview → Apply for the
 * student↔teacher link sync (SPE-540). Reads the SIS class rosters and fills
 * in which teachers each caseload child has, at the caller's OWN district
 * only.
 *
 * DISTRICT ADMINS ONLY, through the same shared gate as the teacher sync:
 * this surface serves student initials and writes child records, both beyond
 * the tech role's integrations-only line. THIS SURFACE HAS NO /internal
 * TWIN — student-level detail stays inside the district's own portal.
 *
 * Apply recomputes the plan server-side, refuses a plan-level refusal
 * outright, and is count-bound to the reviewed preview (409 on drift). Logs
 * stay counts-only; initials exist only in the response for the reviewing
 * admin.
 */
export const POST = withRoute<Record<string, string>, z.infer<typeof bodySchema>>(
  {
    body: bodySchema,
    // Every run walks three full collections against the district's
    // production SIS — keep the ceiling low.
    rateLimit: { requests: 4, windowSeconds: 60, name: 'district-link-sync' },
  },
  async ({ userId, body }) => {
    const gate = await requireDistrictAdminOneRoster(userId, {
      logLabel: 'link sync',
      adminOnlyMessage: 'Forbidden: the class roster sync is for district admins.',
      noConnectionMessage:
        'The class roster sync needs a OneRoster connection. Set one up in the tech portal first.',
    });
    if (!gate.ok) return gate.response;
    const { connection, credential } = gate;

    // Wrapped: withRoute's dev-mode catch echoes error.message, and a failure
    // here can carry the base URL, upstream fragments, or table names.
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
      log.error('Reading rosters for the link sync failed', err, {
        connectionId: connection.id,
        districtId: connection.district_id,
      });
      return NextResponse.json(
        {
          error:
            'Speddy could not finish reading your SIS and records. Nothing was written — ' +
            'try again in a moment.',
        },
        { status: 502 },
      );
    }
    const plan = planStudentTeacherLinkSync(input);

    log.info('Link sync planned by district admin', {
      connectionId: connection.id,
      districtId: connection.district_id,
      actorId: userId,
      mode: body.mode,
      plan: linkPlanCounts(plan),
    });

    if (body.mode === 'dry-run') {
      return NextResponse.json({ mode: 'dry-run', plan });
    }

    // A refused plan has nothing writable, whatever count the client sent.
    if (plan.refusal) {
      return NextResponse.json(
        { error: `Nothing can be applied: ${plan.refusal}` },
        { status: 409 },
      );
    }

    const writable = writableLinkChangeCount(plan);
    if (writable !== body.expectedChanges) {
      log.info('Link sync apply refused: the plan moved since the preview', {
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

    // Wrapped so a mid-apply failure answers honestly and SANITIZED: the
    // writer's stop-on-failure error names schools and database details that
    // withRoute's dev-mode catch would echo, and by this point some schools
    // may have committed — "nothing was written" would be a lie.
    let written;
    try {
      written = await applyLinkSyncPlan({
        plan,
        actorId: userId,
        connectionId: connection.id,
        districtId: connection.district_id,
      });
    } catch (err) {
      log.error('Applying the link sync failed partway', err, {
        connectionId: connection.id,
        districtId: connection.district_id,
      });
      return NextResponse.json(
        {
          error:
            'The apply hit an error partway — some changes may already be saved. ' +
            'Run the preview again; it shows the current state.',
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ mode: 'apply', plan, written });
  },
);
