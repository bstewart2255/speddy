/**
 * SPE-458: the scheduler loaded bell schedules and special activities filtered
 * only by school, never by school_year — so once a school held more than one
 * year, conflict detection unioned them all. A period retimed or removed for
 * the new year kept blocking slots, because last year's row was still in the
 * result set.
 *
 * Every other reader is year-scoped: the provider Bell Schedules and Special
 * Activities pages both pin to getCurrentSchoolYear(). The scheduler was the
 * one reader ignoring the column, which made it possible for a bell schedule
 * nobody can see in the app to still block scheduling.
 *
 * The mock below applies the filters rather than merely recording them, so
 * these assert what the scheduler ends up holding — not that some particular
 * line was written.
 */

type Row = Record<string, unknown>;

// `mock`-prefixed so the jest.mock factory (hoisted above imports) may reference it.
const mockState: { rows: Record<string, Row[]> } = { rows: {} };

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    // The batch RPC throws for every provider at every school today (see the
    // SPE-463 note in the data manager), so the parallel path is what runs.
    rpc: () => ({ single: async () => ({ data: null, error: { message: 'unavailable' } }) }),
    from: (table: string) => {
      const filters: Array<[string, string, unknown]> = [];

      const query: any = {
        select: () => query,
        eq: (col: string, val: unknown) => {
          filters.push(['eq', col, val]);
          return query;
        },
        is: (col: string, val: unknown) => {
          filters.push(['is', col, val]);
          return query;
        },
        or: () => query,
        in: () => query,
        limit: () => query,
        single: async () => ({ data: null, error: { message: 'no row' } }),
        then: (resolve: (r: unknown) => unknown) => {
          const data = (mockState.rows[table] || []).filter((row) =>
            filters.every(([op, col, val]) =>
              op === 'is' ? row[col] === null || row[col] === undefined : row[col] === val,
            ),
          );
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return query;
    },
  }),
}));

import { SchedulingDataManager } from '@/lib/scheduling/scheduling-data-manager';
import { getCurrentSchoolYear } from '@/lib/school-year';

const THIS_YEAR = getCurrentSchoolYear();
const LAST_YEAR = (() => {
  const start = parseInt(THIS_YEAR.split('-')[0], 10);
  return `${start - 1}-${start}`;
})();

const SCHOOL_ID = '061899002301';
const SCHOOL_SITE = 'Rodeo Hills Elementary';

function manager() {
  const mgr = SchedulingDataManager.getInstance() as any;
  mgr.cacheMetadata = { lastFetched: new Date(), isStale: false, fetchErrors: [], queryCount: 0 };
  mgr.schoolYear = THIS_YEAR;
  return mgr;
}

beforeEach(() => {
  mockState.rows = {};
});

describe('SchedulingDataManager year scoping (SPE-458)', () => {
  it('loads only the current year for a school holding two years of bell schedules', async () => {
    mockState.rows.bell_schedules = [
      { id: 'now-recess', school_id: SCHOOL_ID, school_year: THIS_YEAR },
      { id: 'now-lunch', school_id: SCHOOL_ID, school_year: THIS_YEAR },
      // Retimed for the new year; this row is invisible in the app and must not
      // block a slot the new year freed up.
      { id: 'last-year-lunch', school_id: SCHOOL_ID, school_year: LAST_YEAR },
    ];

    const mgr = manager();
    mgr.schoolId = SCHOOL_ID;
    mgr.schoolSite = null;

    const rows = await mgr.fetchForSchool('bell_schedules', 'Bell schedules');

    expect(rows.map((r: Row) => r.id).sort()).toEqual(['now-lunch', 'now-recess']);
  });

  it('scopes the legacy school_site pass by year too, not just the school_id pass', async () => {
    // Walnut Acres' shape: school_site set, school_id NULL. The year filter has
    // to reach this pass as well, or half the fix is missing for exactly the
    // school SPE-463 was about.
    mockState.rows.bell_schedules = [
      { id: 'legacy-now', school_site: SCHOOL_SITE, school_id: null, school_year: THIS_YEAR },
      { id: 'legacy-old', school_site: SCHOOL_SITE, school_id: null, school_year: LAST_YEAR },
    ];

    const mgr = manager();
    mgr.schoolId = null;
    mgr.schoolSite = SCHOOL_SITE;

    const rows = await mgr.fetchForSchool('bell_schedules', 'Bell schedules');

    expect(rows.map((r: Row) => r.id)).toEqual(['legacy-now']);
  });

  it('still returns both key shapes for the current year — year scoping must not undo SPE-463', async () => {
    mockState.rows.special_activities = [
      { id: 'by-id', school_id: SCHOOL_ID, school_year: THIS_YEAR },
      { id: 'legacy', school_site: SCHOOL_SITE, school_id: null, school_year: THIS_YEAR },
      { id: 'by-id-old', school_id: SCHOOL_ID, school_year: LAST_YEAR },
    ];

    const mgr = manager();
    mgr.schoolId = SCHOOL_ID;
    mgr.schoolSite = SCHOOL_SITE;

    const rows = await mgr.fetchForSchool('special_activities', 'Special activities');

    expect(rows.map((r: Row) => r.id).sort()).toEqual(['by-id', 'legacy']);
  });

  it('never issues an unscoped query, even when a school has only one year', async () => {
    // The bug was dormant precisely because every school had one year. A fix
    // that only works when two years exist would look green here forever.
    mockState.rows.bell_schedules = [{ id: 'only', school_id: SCHOOL_ID, school_year: THIS_YEAR }];

    const mgr = manager();
    mgr.schoolId = SCHOOL_ID;
    mgr.schoolSite = SCHOOL_SITE;
    mgr.schoolYear = LAST_YEAR; // ask for a year this school has no rows in

    const rows = await mgr.fetchForSchool('bell_schedules', 'Bell schedules');

    expect(rows).toEqual([]);
  });
});

describe('SchedulingDataManager cache reuse across the Aug 1 rollover (SPE-458)', () => {
  it('treats a cache built in a previous school year as not initialized', () => {
    const mgr = manager();
    mgr.initialized = true;
    mgr.schoolSite = SCHOOL_SITE;
    mgr.schoolDistrict = 'John Swett Unified';
    mgr.schoolId = SCHOOL_ID;
    mgr.schoolYear = LAST_YEAR;

    // Same school, same district, same id — only the year is stale. The
    // singleton outlives any one page, so without this the auto-scheduler
    // would reuse last year's bell schedules straight from memory.
    expect(mgr.isInitializedForSchool(SCHOOL_SITE, 'John Swett Unified', SCHOOL_ID)).toBe(false);
  });

  it('still reports initialized for the current year', () => {
    const mgr = manager();
    mgr.initialized = true;
    mgr.schoolSite = SCHOOL_SITE;
    mgr.schoolDistrict = 'John Swett Unified';
    mgr.schoolId = SCHOOL_ID;
    mgr.schoolYear = THIS_YEAR;

    expect(mgr.isInitializedForSchool(SCHOOL_SITE, 'John Swett Unified', SCHOOL_ID)).toBe(true);
  });

  // The cache-key guard above only fires when a caller asks. refresh() does
  // not ask — it reloads in place whenever the 15-minute cache goes stale.
  // Deriving the year once at initialize() therefore left a page open across
  // the rollover reloading against last year indefinitely, reading back as
  // zero rows with no error. Re-deriving on every load closes both doors.
  it('re-derives the year on every load, so a refresh after the rollover moves to the new year', async () => {
    mockState.rows.bell_schedules = [{ id: 'a', school_id: SCHOOL_ID, school_year: THIS_YEAR }];

    const mgr = manager();
    mgr.providerId = 'provider-1';
    mgr.schoolSite = SCHOOL_SITE;
    mgr.schoolDistrict = 'John Swett Unified';
    mgr.schoolId = SCHOOL_ID;
    mgr.schoolYear = LAST_YEAR; // cache built before Aug 1

    await mgr.refresh();

    expect(mgr.schoolYear).toBe(THIS_YEAR);
    // And the reload actually picked up the current year's rows.
    expect(mgr.data.data.bellSchedules.size).toBeGreaterThan(0);
  });
});
