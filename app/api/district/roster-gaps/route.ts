import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/with-route';
import { requireDistrictAdmin } from '@/lib/api/district-admin-gate';
import { logger } from '@/lib/logger';
import { loadLastPublishedAt, loadRosterGaps } from '@/lib/district-roster/gaps-io';

export const runtime = 'nodejs';

// Reads every child in the district plus its whole staff list. Well short of
// the import's ceiling — nothing here writes — but a large district's page load
// should not be cut off at the platform default either.
export const maxDuration = 60;

const log = logger.child({ module: 'district-roster-gaps' });

/**
 * GET /api/district/roster-gaps — which published students reach no provider,
 * and why (SPE-587).
 *
 * The district's standing answer to "did anyone actually pick these students
 * up?". Computed fresh on every request from `children` and the district's
 * staff list, so it can never be stale and there is nothing to keep in sync;
 * publishing a new roster changes what this returns without this route knowing
 * a publish happened.
 *
 * DISTRICT ADMINS ONLY, through the shared gate — the same admission the roster
 * import uses. The response carries student names, grades and schools across
 * every school in the district, which is well outside the tech role's
 * integrations-only line (SPE-393), and staff names with their roles besides.
 *
 * Logs stay counts-only. Names exist in the response, for the admin whose
 * district it is, and nowhere else.
 */
export const GET = withRoute(
  {
    // A page-load read, so a higher ceiling than the import's 6/min — but it is
    // an expensive one, and nothing about it needs to be re-run in a tight loop.
    rateLimit: { requests: 30, windowSeconds: 60, name: 'district-roster-gaps' },
  },
  async ({ userId }) => {
    const gate = await requireDistrictAdmin(userId, {
      logLabel: 'district roster gaps',
      adminOnlyMessage: 'Forbidden: the district roster is for district admins.',
    });
    if (!gate.ok) return gate.response;
    const { districtId } = gate;

    const [gaps, lastPublishedAt] = await Promise.all([
      loadRosterGaps(districtId),
      loadLastPublishedAt(districtId),
    ]);

    log.info('District roster gaps read', {
      districtId,
      onRoster: gaps.totalOnRoster,
      unserved: gaps.totalUnserved,
      groups: gaps.groups.length,
    });

    // The body carries student names, grades and schools across the district.
    // The gate reads cookies, so Next.js already treats this as dynamic and
    // does not cache it — the header says so outright rather than resting on
    // that inference, or on what an intermediate cache decides to do.
    return NextResponse.json(
      { gaps, lastPublishedAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  },
);
