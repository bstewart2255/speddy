/**
 * SPE-271 — school scoping belongs to the method, not to each caller's memory.
 *
 * `getSessionsForDateRange` scopes by provider and role but not by school, so
 * every schedule-rendering caller had to remember to pipe the result through
 * `filterSessionsBySchool`. The Plan page forgot, and SPE-270 was the bug.
 *
 * What these tests pin, in order of how much they matter:
 *   - the scoped method actually filters (otherwise the refactor is decorative
 *     and SPE-270 is reintroduced silently, since callers no longer filter);
 *   - it keeps the fail-closed behaviour of SPE-141 — a school lookup that
 *     errors yields [] rather than everything;
 *   - the UNSCOPED method still returns unscoped rows, because the
 *     daily-schedule-email cron depends on that and a "tidy-up" that makes
 *     scoping unconditional would quietly drop every school but one from those
 *     emails;
 *   - no school context is a pass-through, matching filterSessionsBySchool.
 */
import { SessionGenerator } from '@/lib/services/session-generator';

jest.mock('@/lib/monitoring/logger', () => ({
  log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// The generator builds its own client when none is injected; this stub stands in
// for the module so importing it in a test env doesn't reach for real config.
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));

const SCHOOL = { school_id: 'school-1', school_site: null, school_district: null } as any;

const IN_SCHOOL = { id: 's1', student_id: 'student-in-school', session_date: '2026-08-14' };
const OUT_OF_SCHOOL = { id: 's2', student_id: 'student-elsewhere', session_date: '2026-08-14' };

/**
 * Supabase stub for the students lookup filterSessionsBySchool performs.
 * Every chainable method returns the builder; awaiting it yields a fixed
 * response, so it works whichever method ends the chain.
 */
function makeSupabase(response: { data: any[] | null; error: any }) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (r: typeof response) => unknown) => resolve(response),
  };
  return { from: jest.fn(() => builder) } as any;
}

/** A generator whose unscoped fetch is stubbed, so only scoping is under test. */
function makeGenerator(
  supabase: any,
  sessions: any[] = [IN_SCHOOL, OUT_OF_SCHOOL]
): SessionGenerator {
  const generator = new SessionGenerator(supabase);
  jest
    .spyOn(generator, 'getSessionsForDateRange')
    .mockResolvedValue(sessions as any);
  return generator;
}

const START = new Date('2026-08-10T00:00:00Z');
const END = new Date('2026-08-14T00:00:00Z');

describe('SessionGenerator school scoping (SPE-271)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('drops sessions whose student is not at the current school', async () => {
    // Only student-in-school is returned by the membership lookup.
    const generator = makeGenerator(
      makeSupabase({ data: [{ id: 'student-in-school' }], error: null })
    );

    const result = await generator.getSchoolScopedSessionsForDateRange(
      'provider-1',
      START,
      END,
      'resource',
      SCHOOL
    );

    expect(result.map((s: any) => s.id)).toEqual(['s1']);
  });

  it('returns [] rather than everything when the school lookup errors (SPE-141)', async () => {
    // The property that matters: a transient failure must not fall back to
    // unfiltered rows, which is exactly how another school's sessions would
    // reach the screen.
    const generator = makeGenerator(
      makeSupabase({ data: null, error: { message: 'connection reset', code: 'PGRST000' } })
    );

    const result = await generator.getSchoolScopedSessionsForDateRange(
      'provider-1',
      START,
      END,
      'resource',
      SCHOOL
    );

    expect(result).toEqual([]);
  });

  it('passes everything through when there is no school context', async () => {
    const generator = makeGenerator(makeSupabase({ data: [], error: null }));

    const result = await generator.getSchoolScopedSessionsForDateRange(
      'provider-1',
      START,
      END,
      'resource',
      null
    );

    expect(result.map((s: any) => s.id)).toEqual(['s1', 's2']);
  });

  it('leaves the unscoped method unscoped — the cron depends on it', async () => {
    // daily-schedule-emails calls getSessionsForDateRange deliberately: a cron
    // has no current school, and a provider working across several schools must
    // get their whole day in one email. If someone "finishes" this refactor by
    // making scoping unconditional, this fails.
    const generator = makeGenerator(
      makeSupabase({ data: [{ id: 'student-in-school' }], error: null })
    );

    const result = await generator.getSessionsForDateRange(
      'provider-1',
      START,
      END,
      'resource'
    );

    expect(result.map((s: any) => s.id)).toEqual(['s1', 's2']);
  });

  it('forwards provider, range and role to the underlying fetch unchanged', async () => {
    const generator = makeGenerator(makeSupabase({ data: [], error: null }));

    await generator.getSchoolScopedSessionsForDateRange(
      'provider-1',
      START,
      END,
      'sea',
      SCHOOL
    );

    expect(generator.getSessionsForDateRange).toHaveBeenCalledWith(
      'provider-1',
      START,
      END,
      'sea'
    );
  });
});
