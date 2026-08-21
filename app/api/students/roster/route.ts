import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { requireProvider } from '@/lib/api/provider-gate';
import { logger } from '@/lib/logger';
import { hasRosterOffers, planRosterClaims } from '@/lib/district-roster/claim-plan';
import {
  applyRosterAcceptances,
  claimRosterChildren,
  enrichClaimedStudents,
  loadProviderRosterContext,
} from '@/lib/district-roster/claim-io';

export const runtime = 'nodejs';

const log = logger.child({ module: 'provider-roster-claim' });

const FIELD_KEYS = [
  'firstName',
  'lastName',
  'gradeLevel',
  'districtStudentId',
  'dateOfBirth',
  'upcomingIepDate',
  'upcomingTriennialDate',
  'serviceMinutes',
  'accommodations',
  'testingAccommodations',
  'iepGoals',
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
 * district's roster (SPE-447 slice 2, role-scoped by SPE-577): students at
 * their school whose services for THIS caller's discipline nobody has picked
 * up, and students of theirs whose details the roster has newer.
 *
 * Everything is scoped to the caller by the caller: their schools come from
 * `user_accessible_school_ids()` run as them, and the offer can never include a
 * student `claim_roster_children` would refuse, because both consult the same
 * function.
 */
export const GET = withRoute({}, async ({ userId }) => {
  // Authentication alone is NOT enough here: the roster is read with the
  // service client, and `user_accessible_school_ids()` answers for teachers,
  // SEAs and admins too — so without this, any signed-in teacher at the school
  // would receive names, district student ids and IEP dates for every unserved
  // student on the district's roster.
  const gate = await requireProvider(userId);
  if (!gate.ok) return gate.response;

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
 * enforces the planner's whole decision table in the database rather than
 * here: a student at a school you work at, with a service line your discipline
 * delivers, not served by a provider of a blocking role (SPE-577); any
 * caseload at all refuses when the child carries no routable services — so
 * this route cannot widen it, and neither can a future one.
 */
export const POST = withRoute<Record<string, string>, z.infer<typeof bodySchema>>(
  {
    body: bodySchema,
    rateLimit: { requests: 20, windowSeconds: 60, name: 'provider-roster-claim' },
  },
  async ({ userId, body }) => {
    const gate = await requireProvider(userId);
    if (!gate.ok) return gate.response;

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

    // The district's data rides along onto the rows just created (SPE-575):
    // minutes for this caller's role, accommodations, testing accommodations,
    // their discipline's goals, DOB. Best-effort — a miss is logged and comes
    // back as a fill offer on the next banner load, never a failed claim. The
    // wrapper is what makes that promise total: a throw from outside the
    // per-student guard (e.g. client construction) must not turn committed
    // claims into a 500 that hides them.
    let enrichment = { enriched: 0, enrichFailures: 0 };
    try {
      enrichment = await enrichClaimedStudents({ plan, claims });
    } catch (err) {
      log.error('Enriching claimed students failed outright', err, { userId });
      enrichment = {
        enriched: 0,
        enrichFailures: claims.filter((c) => c.outcome === 'claimed').length,
      };
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

    // Per-outcome, NOT one lump. Each refusal has a different remedy, so each
    // keeps its own number: telling a provider "already picked up by someone
    // else" about a deterministic initials clash — or about a student who left
    // their school — sends them looking for a race that never happened.
    const countOf = (outcome: string) => claims.filter((c) => c.outcome === outcome).length;
    const claimed = countOf('claimed');
    const duplicateInitials = countOf('duplicate-initials');
    // Somebody got there first: the database found a caseload row, or the
    // recomputed plan had already stopped offering them before we asked. That
    // gap is overwhelmingly the same race, seen a moment earlier.
    const takenBySomeoneElse = countOf('already-served') + (requested.length - claims.length);
    // A different refusal entirely, and it is NOT a race: the student is no
    // longer on the roster at a school this caller works at — or (only via a
    // direct call this screen never makes) carries no service line for the
    // caller's discipline.
    const outOfScope = countOf('out-of-scope');

    log.info('Provider roster claim applied', {
      userId,
      claimed,
      duplicateInitials,
      takenBySomeoneElse,
      outOfScope,
      updated: accepted.applied,
      skipped: accepted.skipped,
      enriched: enrichment.enriched,
      enrichFailures: enrichment.enrichFailures,
    });

    return NextResponse.json({
      claimed,
      duplicateInitials,
      takenBySomeoneElse,
      outOfScope,
      updatedFields: accepted.applied,
      skippedFields: accepted.skipped,
      enrichFailures: enrichment.enrichFailures,
    });
  },
);
