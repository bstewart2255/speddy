import { filterSessionsBySchool, type Session, type SchoolContext } from '@/lib/utils/session-filters';

// Assert on the logged error path so an empty result is proven to come from the
// fail-closed branch, not from a successful-but-empty query.
jest.mock('@/lib/monitoring/logger', () => ({
  log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
import { log } from '@/lib/monitoring/logger';

type QueryResponse = { data: any[] | null; error: any };

/**
 * A thenable Supabase query stub: every chainable method returns the same
 * builder, and awaiting it resolves to a fixed response — so it works no matter
 * which method (`.in()`, trailing `.eq()`) ends the chain in each branch.
 */
function makeSupabase(response: QueryResponse) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (r: QueryResponse) => unknown) => resolve(response),
  };
  return { from: jest.fn(() => builder) } as any;
}

const sessions: Session[] = [
  { student_id: 'student-in-school' },
  { student_id: 'student-other-school' },
];

const dbError = { message: 'connection reset', code: 'PGRST000' };

describe('filterSessionsBySchool fails closed on lookup error (SPE-141)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns [] (not the unfiltered input) when the school_id lookup errors', async () => {
    const supabase = makeSupabase({ data: null, error: dbError });
    const result = await filterSessionsBySchool(supabase, sessions, {
      school_id: 'school-1',
    } as SchoolContext);

    expect(result).toEqual([]);
    expect(log.error).toHaveBeenCalledWith(
      'Failed to filter sessions by school_id',
      dbError,
      expect.any(Object),
    );
  });

  it('returns [] when the district_id lookup errors', async () => {
    const supabase = makeSupabase({ data: null, error: dbError });
    const result = await filterSessionsBySchool(supabase, sessions, {
      district_id: 'district-1',
      school_site: 'Willow',
    } as SchoolContext);

    expect(result).toEqual([]);
    expect(log.error).toHaveBeenCalledWith(
      'Failed to filter sessions by district_id',
      dbError,
      expect.any(Object),
    );
  });

  it('returns [] when the legacy school_site lookup errors', async () => {
    const supabase = makeSupabase({ data: null, error: dbError });
    const result = await filterSessionsBySchool(supabase, sessions, {
      school_site: 'Willow',
      school_district: 'Metro',
    } as SchoolContext);

    expect(result).toEqual([]);
    expect(log.error).toHaveBeenCalledWith(
      'Failed to filter sessions by school_site',
      dbError,
      expect.any(Object),
    );
  });

  it('still filters normally when the lookup succeeds (fail-closed does not over-block)', async () => {
    const supabase = makeSupabase({
      data: [{ id: 'student-in-school' }],
      error: null,
    });
    const result = await filterSessionsBySchool(supabase, sessions, {
      school_id: 'school-1',
    } as SchoolContext);

    expect(result).toEqual([{ student_id: 'student-in-school' }]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('returns [] on a successful lookup with null data (no error) — never the unfiltered input', async () => {
    // { data: null, error: null } is a non-error empty result. It must resolve
    // to [] (no students matched), not fall back to the unfiltered `sessions`.
    const supabase = makeSupabase({ data: null, error: null });
    const result = await filterSessionsBySchool(supabase, sessions, {
      school_id: 'school-1',
    } as SchoolContext);

    expect(result).toEqual([]);
    expect(log.error).not.toHaveBeenCalled();
  });
});
