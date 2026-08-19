import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { logger } from '@/lib/logger';
import { hasRosterOffers, planRosterClaims } from '@/lib/district-roster/claim-plan';
import {
  applyRosterAcceptances,
  claimRosterChildren,
  loadProviderRosterContext,
} from '@/lib/district-roster/claim-io';

export const runtime = 'nodejs';

const log = logger.child({ module: 'provider-roster-claim' });

const FIELD_KEYS = [
  'firstName',
  'lastName',
  'gradeLevel',
  'districtStudentId',
  'upcomingIepDate',
  'upcomingTriennialDate',
] as const;

const bodySchema = z
  .object({
    claimChildIds: z.array(z.string().uuid()).max(500).optional(),
    acceptChanges: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          fields: z.array(z.enum(FIELD_KEYS)).min(1),
        }),
      )
      .max(500)
      .optional(),
  })
  .refine((b) => (b.claimChildIds?.length ?? 0) + (b.acceptChanges?.length ?? 0) > 0, {
    message: 'Nothing was selected',
  });

/**
 * GET /api/students/roster — what this provider is offered from their
 * district's roster (SPE-447 slice 2): students at their school that nobody
 * serves yet, and students of theirs whose details the roster has newer.
 *
 * Everything is scoped to the caller by the caller: their schools come from
 * `user_accessible_school_ids()` run as them, and the offer can never include a
 * student `claim_roster_children` would refuse, because both consult the same
 * function.
 */
export const GET = withRoute({}, async ({ userId }) => {
  let context;
  try {
    context = await loadProviderRosterContext(userId);
  } catch (err) {
    // Wrapped: withRoute's dev-mode catch echoes error.message, which here can
    // carry table names and database detail.
    log.error('Reading the provider roster offers failed', err, { userId });
    return NextResponse.json(
      { error: 'Speddy could not read your district roster just now. Try again in a moment.' },
      { status: 502 },
    );
  }

  const plan = planRosterClaims(context);
  log.info('Provider roster offers', {
    userId,
    schools: context.schoolIds.length,
    counts: plan.counts,
  });
  return NextResponse.json({ plan, hasOffers: hasRosterOffers(plan) });
});

/**
 * POST /api/students/roster — take some of them.
 *
 * The plan is RECOMPUTED server-side before anything is written, and only what
 * it currently offers is honoured: the request names a student and a field, it
 * never carries the value. Claiming goes through `claim_roster_children`, which
 * enforces "a student at a school you work at, whom nobody serves" in the
 * database rather than here — so this route cannot widen it, and neither can a
 * future one.
 */
export const POST = withRoute<Record<string, string>, z.infer<typeof bodySchema>>(
  {
    body: bodySchema,
    rateLimit: { requests: 20, windowSeconds: 60, name: 'provider-roster-claim' },
  },
  async ({ userId, body }) => {
    let context;
    try {
      context = await loadProviderRosterContext(userId);
    } catch (err) {
      log.error('Reading the provider roster before a claim failed', err, { userId });
      return NextResponse.json(
        {
          error:
            'Speddy could not read your district roster just now. Nothing was changed — ' +
            'try again in a moment.',
        },
        { status: 502 },
      );
    }
    const plan = planRosterClaims(context);

    // Only offer-backed claims reach the database. It would refuse the rest
    // anyway; filtering here keeps the reported outcomes about the student
    // rather than about a request the screen should never have made.
    const offered = new Set(plan.claimable.map((c) => c.childId));
    const requested = [...new Set(body.claimChildIds ?? [])];
    const toClaim = requested.filter((id) => offered.has(id));

    let claims: { childId: string; studentId: string | null; outcome: string }[] = [];
    try {
      if (toClaim.length > 0) claims = await claimRosterChildren(toClaim);
    } catch (err) {
      log.error('Claiming roster students failed', err, { userId, asked: toClaim.length });
      return NextResponse.json(
        { error: 'Those students could not be added. Nothing was changed — reload and try again.' },
        { status: 500 },
      );
    }

    let accepted = { applied: 0, skipped: 0 };
    try {
      if (body.acceptChanges?.length) {
        accepted = await applyRosterAcceptances({ plan, requests: body.acceptChanges });
      }
    } catch (err) {
      // Claims above may already have committed, so this cannot claim that
      // nothing happened.
      log.error('Applying roster updates failed partway', err, { userId });
      return NextResponse.json(
        {
          error:
            'Some updates could not be saved. Reload the page — it shows what actually changed.',
          claimed: claims.filter((c) => c.outcome === 'claimed').length,
        },
        { status: 500 },
      );
    }

    const claimed = claims.filter((c) => c.outcome === 'claimed').length;
    // Anything asked for that the roster no longer offers — someone else got
    // there first, or the admin republished. Reported, never swallowed.
    const notClaimed = requested.length - claimed;

    log.info('Provider roster claim applied', {
      userId,
      claimed,
      notClaimed,
      updated: accepted.applied,
      skipped: accepted.skipped,
    });

    return NextResponse.json({
      claimed,
      notClaimed,
      updatedFields: accepted.applied,
      skippedFields: accepted.skipped,
    });
  },
);
