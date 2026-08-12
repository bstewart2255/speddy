// `mock`-prefixed so the jest.mock factory (hoisted above imports) may reference it.
const mockState: {
  queries: Array<{ table: string; filters: Array<[string, string, unknown]> }>;
  idRows: unknown[];
  legacyRows: unknown[];
} = { queries: [], idRows: [], legacyRows: [] };

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, string, unknown]> = [];
      mockState.queries.push({ table, filters });

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
        // Thenable: the code under test awaits the builder directly.
        then: (resolve: (r: unknown) => unknown) => {
          const matchedSchoolId = filters.some(([op, col]) => op === 'eq' && col === 'school_id');
          return Promise.resolve(
            resolve({ data: matchedSchoolId ? mockState.idRows : mockState.legacyRows, error: null }),
          );
        },
      };
      return query;
    },
  }),
}));

import { SchedulingDataManager } from '@/lib/scheduling/scheduling-data-manager';

/**
 * SPE-463: the school lookup used to be either/or — filter by school_id when we
 * had one, otherwise by school_site. Production holds BOTH shapes at once:
 *
 *   Bancroft / Mt. Diablo / Rodeo Hills → school_id set, school_site NULL
 *   Walnut Acres                        → school_site set, school_id NULL
 *
 * so either/or silently loads nothing for whichever set it skips, and "nothing"
 * means the auto-scheduler books straight over lunch. The first fix for this
 * (forwarding school_id) would have regressed Walnut Acres — 60 bell schedule
 * rows — in exactly the way it fixed the other three. Both keys must match.
 */
function manager() {
  const mgr = SchedulingDataManager.getInstance() as any;
  mgr.cacheMetadata = { lastFetched: new Date(), isStale: false, fetchErrors: [], queryCount: 0 };
  return mgr;
}

beforeEach(() => {
  mockState.queries = [];
  mockState.idRows = [];
  mockState.legacyRows = [];
});

describe('SchedulingDataManager school-key fallback (SPE-463)', () => {
  it('matches rows keyed by school_id AND legacy rows keyed only by school_site', async () => {
    mockState.idRows = [{ id: 'by-id-1' }, { id: 'by-id-2' }];
    mockState.legacyRows = [{ id: 'legacy-1' }];

    const mgr = manager();
    mgr.schoolId = '061899002301';
    mgr.schoolSite = 'Rodeo Hills Elementary';

    const rows = await mgr.fetchForSchool('bell_schedules', 'Bell schedules');

    expect(rows).toHaveLength(3);
    expect(mockState.queries).toHaveLength(2);
  });

  it('restricts the legacy pass to rows with no school_id, so nothing is double-counted', async () => {
    const mgr = manager();
    mgr.schoolId = '061899002301';
    mgr.schoolSite = 'Rodeo Hills Elementary';

    await mgr.fetchForSchool('bell_schedules', 'Bell schedules');

    const legacyPass = mockState.queries.find(q =>
      q.filters.some(([op, col]) => op === 'eq' && col === 'school_site'),
    );
    expect(legacyPass).toBeDefined();
    expect(legacyPass!.filters).toContainEqual(['is', 'school_id', null]);
  });

  it('falls back to school_site alone when no school_id is known', async () => {
    mockState.legacyRows = [{ id: 'legacy-1' }, { id: 'legacy-2' }];

    const mgr = manager();
    mgr.schoolId = null;
    mgr.schoolSite = 'Walnut Acres Elementary';

    const rows = await mgr.fetchForSchool('bell_schedules', 'Bell schedules');

    expect(rows).toHaveLength(2);
    expect(mockState.queries).toHaveLength(1);
    // No school_id known, so the pass must NOT narrow to school_id IS NULL —
    // that would drop rows the migration already keyed by id.
    expect(mockState.queries[0].filters).not.toContainEqual(['is', 'school_id', null]);
  });

  it('applies the same handling to special activities', async () => {
    mockState.idRows = [{ id: 'a' }];
    mockState.legacyRows = [{ id: 'b' }];

    const mgr = manager();
    mgr.schoolId = '062271002462';
    mgr.schoolSite = 'Walnut Acres Elementary';

    const rows = await mgr.fetchForSchool('special_activities', 'Special activities');

    expect(rows).toHaveLength(2);
    expect(mockState.queries.every(q => q.table === 'special_activities')).toBe(true);
  });
});
