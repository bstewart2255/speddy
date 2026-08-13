/**
 * SPE-477: the scheduler's session cache fetched EVERY row for a provider's
 * students — recurring templates and the dated instances materialized from them
 * (SPE-291 keeps a rolling 12-week horizon of those) — capped at 10,000.
 *
 * Instances outrun templates roughly 40:1, so the cap was a real ceiling that
 * arrives on a calendar: the largest provider in prod carried 7,868 instances
 * against 203 templates, 81% of the cap, growing every week the horizon rolls.
 * Past it, PostgREST truncates in unspecified order and returns success — so the
 * auto-scheduler would quietly start planning around a partial schedule, with no
 * error anywhere. Nothing else fetched here wants instances either: SPE-474 was
 * the same confusion showing up as double-booked slots.
 *
 * The mock below APPLIES the filters (and the row cap) rather than recording
 * them, so these assert what the scheduler ends up holding — not that some
 * particular line was written.
 */

type Row = Record<string, unknown>;

// `mock`-prefixed so the jest.mock factory (hoisted above imports) may reference it.
const mockState: { rows: Record<string, Row[]> } = { rows: {} };

type Predicate = (row: Row) => boolean;

/** `student_id.in.(a,b),assigned_to_specialist_id.eq.p1` → OR of two predicates. */
function parseOr(clause: string): Predicate {
  const parts = clause.split(/,(?=[a-z_]+\.(?:in|eq)\.)/);
  const predicates: Predicate[] = parts.map((part) => {
    const inMatch = part.match(/^([a-z_]+)\.in\.\((.*)\)$/);
    if (inMatch) {
      const values = new Set(inMatch[2].split(',').filter(Boolean));
      return (row: Row) => values.has(String(row[inMatch[1]]));
    }
    const eqMatch = part.match(/^([a-z_]+)\.eq\.(.*)$/);
    if (eqMatch) return (row: Row) => row[eqMatch[1]] === eqMatch[2];
    throw new Error(`unhandled .or() clause: ${part}`);
  });
  return (row: Row) => predicates.some((p) => p(row));
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: () => ({ single: async () => ({ data: null, error: { message: 'unavailable' } }) }),
    from: (table: string) => {
      const predicates: Predicate[] = [];
      let rowLimit: number | null = null;

      const query: any = {
        select: () => query,
        eq: (col: string, val: unknown) => {
          predicates.push((row) => row[col] === val);
          return query;
        },
        is: (col: string, val: unknown) => {
          if (val !== null) throw new Error(`unhandled .is(${col}, ${String(val)})`);
          predicates.push((row) => row[col] === null || row[col] === undefined);
          return query;
        },
        in: (col: string, vals: unknown[]) => {
          const set = new Set(vals);
          predicates.push((row) => set.has(row[col] as never));
          return query;
        },
        or: (clause: string) => {
          predicates.push(parseOr(clause));
          return query;
        },
        order: () => query,
        limit: (n: number) => {
          rowLimit = n;
          return query;
        },
        single: async () => ({ data: null, error: { message: 'no row' } }),
        then: (resolve: (r: unknown) => unknown) => {
          let data = (mockState.rows[table] || []).filter((row) => predicates.every((p) => p(row)));
          // PostgREST truncates at the cap and still reports success — the
          // silent failure this ticket is about.
          if (rowLimit !== null) data = data.slice(0, rowLimit);
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return query;
    },
  }),
}));

import { SchedulingDataManager } from '@/lib/scheduling/scheduling-data-manager';

const PROVIDER_ID = 'provider-1';
const SCHOOL_ID = '061899002301';

function manager(role: string | null = null) {
  const mgr = SchedulingDataManager.getInstance() as any;
  mgr.cacheMetadata = { lastFetched: new Date(), isStale: false, fetchErrors: [], queryCount: 0 };
  mgr.providerId = PROVIDER_ID;
  mgr.providerRole = role;
  mgr.schoolId = SCHOOL_ID;
  mgr.schoolSite = null;
  mgr.schoolDistrict = null;
  return mgr;
}

const student = (id: string) => ({ id, provider_id: PROVIDER_ID, school_id: SCHOOL_ID });

/** A recurring template: no date, present on the weekly grid. */
const template = (id: string, studentId: string) => ({
  id,
  student_id: studentId,
  provider_id: PROVIDER_ID,
  day_of_week: 1,
  start_time: '09:00:00',
  session_date: null,
  is_template: true,
  deleted_at: null,
});

/** A dated instance materialized from a template — same day and time. */
const instance = (id: string, studentId: string, date: string) => ({
  ...template(id, studentId),
  id,
  session_date: date,
  is_template: false,
});

beforeEach(() => {
  mockState.rows = {};
});

describe('SchedulingDataManager holds templates only (SPE-477)', () => {
  it('drops dated instances for a plain provider', async () => {
    mockState.rows.students = [student('s1')];
    mockState.rows.schedule_sessions = [
      template('t1', 's1'),
      instance('i1', 's1', '2026-08-17'),
      instance('i2', 's1', '2026-08-24'),
      template('t2', 's1'),
    ];

    const sessions = await manager().fetchExistingSessions();

    expect(sessions.map((s: Row) => s.id).sort()).toEqual(['t1', 't2']);
  });

  it('drops soft-deleted templates, which are invisible everywhere else', async () => {
    // A deleted template still occupies its slot in this cache, so the
    // scheduler treats a freed-up time as taken and refuses to place there.
    mockState.rows.students = [student('s1')];
    mockState.rows.schedule_sessions = [
      template('live', 's1'),
      { ...template('deleted', 's1'), deleted_at: '2026-08-01T00:00:00Z' },
    ];

    const sessions = await manager().fetchExistingSessions();

    expect(sessions.map((s: Row) => s.id)).toEqual(['live']);
  });

  it('scopes the specialist path too — that branch fetches the most rows', async () => {
    // Specialists read their own students' sessions OR anything assigned to
    // them, so this is the widest query in the file and the one nearest the cap.
    mockState.rows.students = [
      student('s1'),
      // Another provider's student at this school, delegated to me.
      { id: 'other-student', provider_id: 'provider-2', school_id: SCHOOL_ID },
    ];
    mockState.rows.schedule_sessions = [
      template('mine', 's1'),
      instance('mine-dated', 's1', '2026-08-17'),
      { ...template('mine-deleted', 's1'), deleted_at: '2026-08-01T00:00:00Z' },
      { ...template('assigned', 'other-student'), assigned_to_specialist_id: PROVIDER_ID },
      {
        ...instance('assigned-dated', 'other-student', '2026-08-17'),
        assigned_to_specialist_id: PROVIDER_ID,
      },
    ];

    const sessions = await manager('resource').fetchExistingSessions();

    expect(sessions.map((s: Row) => s.id).sort()).toEqual(['assigned', 'mine']);
  });

  it('scopes the specialist-with-no-students path', async () => {
    mockState.rows.students = [{ id: 'other-student', provider_id: 'provider-2', school_id: SCHOOL_ID }];
    mockState.rows.schedule_sessions = [
      { ...template('assigned', 'other-student'), assigned_to_specialist_id: PROVIDER_ID },
      {
        ...instance('assigned-dated', 'other-student', '2026-08-17'),
        assigned_to_specialist_id: PROVIDER_ID,
      },
      {
        ...template('assigned-deleted', 'other-student'),
        assigned_to_specialist_id: PROVIDER_ID,
        deleted_at: '2026-08-01T00:00:00Z',
      },
    ];

    const sessions = await manager('speech').fetchExistingSessions();

    expect(sessions.map((s: Row) => s.id)).toEqual(['assigned']);
  });
});

describe('the 10,000-row cap stops being a deadline (SPE-477)', () => {
  it('keeps every template for a caseload whose instances would blow the cap', async () => {
    // The prod shape, scaled past the ceiling: one provider, a couple hundred
    // recurring sessions, and a 12-week horizon of instances behind them.
    // PostgREST returns rows in unspecified order, so model the worst case —
    // instances first. Unscoped, the read fills all 10,000 rows with instances
    // and the provider's real weekly schedule never arrives, reported as
    // success. The assertion that matters is the one on the templates.
    mockState.rows.students = [student('s1')];
    const instances = Array.from({ length: 10_000 }, (_, i) =>
      instance(`i${i}`, 's1', '2026-08-17'),
    );
    const templates = Array.from({ length: 203 }, (_, i) => template(`t${i}`, 's1'));
    mockState.rows.schedule_sessions = [...instances, ...templates];

    const sessions = await manager().fetchExistingSessions();

    expect(sessions).toHaveLength(203);
    expect(sessions.every((s: Row) => s.session_date === null)).toBe(true);
  });
});
