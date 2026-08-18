/**
 * SPE-542: the "last saved" probes ask for one row's `updated_at`, but having
 * saved nothing yet is a normal state — a provider who has not created a bell
 * schedule at a school legitimately matches zero rows.
 *
 * `.single()` sets PostgREST's single-object Accept header, which answers 406
 * on zero rows, so exactly the providers with the least data tripped an error
 * on every load. `.maybeSingle()` returns null instead.
 *
 * The Supabase mock below models that PostgREST behaviour faithfully, so these
 * tests fail if a probe reverts to `.single()`. All data is fictional.
 */

interface ProbeRow {
  updated_at: string;
}

interface MockState {
  rows: ProbeRow[];
  from: string[];
  eq: Array<[string, unknown]>;
  terminal: string[];
  lastResponse: { data: ProbeRow | null; error: { code: string; status: number } | null } | null;
}

jest.mock('@/lib/supabase/client', () => {
  const state: MockState = { rows: [], from: [], eq: [], terminal: [], lastResponse: null };

  const notAcceptable = { code: 'PGRST116', status: 406 } as const;

  const respond = (data: ProbeRow | null, error: { code: string; status: number } | null) => {
    state.lastResponse = { data, error };
    return Promise.resolve(state.lastResponse);
  };

  const makeBuilder = () => {
    const builder: Record<string, (...args: never[]) => unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: ((column: string, value: unknown) => {
        state.eq.push([column, value]);
        return builder;
      }) as never,
      // PostgREST: a single-object request over anything but exactly one row is
      // 406 Not Acceptable — the bug SPE-542 fixed.
      single: () => {
        state.terminal.push('single');
        return state.rows.length === 1 ? respond(state.rows[0], null) : respond(null, notAcceptable);
      },
      maybeSingle: () => {
        state.terminal.push('maybeSingle');
        return state.rows.length <= 1 ? respond(state.rows[0] ?? null, null) : respond(null, notAcceptable);
      },
    };
    return builder;
  };

  const createClient = jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'provider-1' } } })),
    },
    from: jest.fn((table: string) => {
      state.from.push(table);
      return makeBuilder();
    }),
  }));

  return { createClient, __state: state };
});

import {
  getLastSavedBellSchedule,
  getLastSavedSpecialActivity,
  getLastSavedSchoolHours,
} from '@/lib/supabase/queries/last-saved';

const state = (jest.requireMock('@/lib/supabase/client') as { __state: MockState }).__state;

// school_hours only carries school_site; the other two prefer school_id when the
// caller has one. `schoolFilter` is the eq() each probe must issue for `school`
// below — the mock does not filter rows, so a dropped school filter is only
// visible as a missing eq().
const probes = [
  {
    name: 'bell schedules',
    table: 'bell_schedules',
    fn: getLastSavedBellSchedule,
    schoolFilter: ['school_id', 'school-1'],
  },
  {
    name: 'special activities',
    table: 'special_activities',
    fn: getLastSavedSpecialActivity,
    schoolFilter: ['school_id', 'school-1'],
  },
  {
    name: 'school hours',
    table: 'school_hours',
    fn: getLastSavedSchoolHours,
    schoolFilter: ['school_site', 'Fictional Elementary'],
  },
] as const;

const school = { school_id: 'school-1', school_site: 'Fictional Elementary' };

beforeEach(() => {
  state.rows = [];
  state.from = [];
  state.eq = [];
  state.terminal = [];
  state.lastResponse = null;
});

describe.each(probes)('getLastSaved — $name (SPE-542)', ({ table, fn, schoolFilter }) => {
  it('treats "nothing saved yet" as null rather than a 406', async () => {
    state.rows = [];

    const result = await fn(school);

    expect(result).toBeNull();
    expect(state.from).toEqual([table]);
    // The fix itself: a single-object request would have been refused here.
    expect(state.terminal).toEqual(['maybeSingle']);
    expect(state.lastResponse?.error).toBeNull();
  });

  it('returns the timestamp when a row exists', async () => {
    state.rows = [{ updated_at: '2026-08-17T12:00:00.000Z' }];

    await expect(fn(school)).resolves.toBe('2026-08-17T12:00:00.000Z');
    expect(state.terminal).toEqual(['maybeSingle']);
    expect(state.lastResponse?.error).toBeNull();
  });

  it('scopes the probe to the signed-in provider and the given school', async () => {
    await fn(school);

    expect(state.eq).toEqual([['provider_id', 'provider-1'], schoolFilter]);
  });

  it('falls back to school_site for a school with no school_id', async () => {
    await fn({ school_site: 'Fictional Elementary' });

    expect(state.eq).toEqual([
      ['provider_id', 'provider-1'],
      ['school_site', 'Fictional Elementary'],
    ]);
  });

  it('returns null without querying when there is no school', async () => {
    await expect(fn(undefined)).resolves.toBeNull();

    expect(state.from).toEqual([]);
  });
});
