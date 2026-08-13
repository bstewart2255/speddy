/**
 * SPE-476: `detectSessionConflicts` compared every one of a student's sessions
 * against every other by weekday alone, with no template/instance distinction.
 *
 * A dated instance is generated from its template and shares its weekday and
 * time by construction, so each instance was reported as overlapping its own
 * parent. Since `updateStudent` runs this whenever `sessions_per_week` or
 * `minutes_per_session` changes, simply editing a student's service minutes
 * conflict-flagged their entire materialized schedule. In prod, 144 of the 145
 * flags were that false positive — against exactly one real double-booking.
 *
 * The rule is that the two layers are not comparable: templates are compared
 * against templates on the same weekday, instances against instances on the
 * same date. These tests pin both directions — no false positive across the
 * layers, and genuine double-bookings within a layer still caught.
 */

type Row = {
  id: string;
  student_id: string;
  provider_id: string | null;
  service_type: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  session_date: string | null;
  is_template: boolean;
  deleted_at: string | null;
  status: string;
  is_completed: boolean;
};

/** Sessions the mocked database returns for the student. */
let rows: Row[] = [];
/** Every id passed to markConflictingSessions, with its reason. */
let flagged: Array<{ id: string; reason: string }> = [];

function template(id: string, day: number, start: string, end: string): Row {
  return {
    id,
    student_id: 'student-1',
    provider_id: 'provider-1',
    service_type: 'resource',
    day_of_week: day,
    start_time: start,
    end_time: end,
    session_date: null,
    is_template: true,
    deleted_at: null,
    status: 'active',
    is_completed: false,
  };
}

/** A dated occurrence of a template: same weekday and time, a concrete date. */
function instance(id: string, date: string, day: number, start: string, end: string): Row {
  return { ...template(id, day, start, end), id, session_date: date, is_template: false };
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chain = (): any => {
      const state: { update?: Record<string, unknown>; id?: string } = {};
      const self: any = {
        select: () => self,
        eq: (column: string, value: string) => {
          if (column === 'id') state.id = value;
          return self;
        },
        is: () => self,
        neq: () => self,
        order: () => self,
        update: (payload: Record<string, unknown>) => {
          state.update = payload;
          return self;
        },
        insert: () => self,
        delete: () => self,
        single: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (state.update && state.id && state.update.has_conflict === true) {
            flagged.push({ id: state.id, reason: String(state.update.conflict_reason) });
          }
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };
      return self;
    };
    return { from: () => chain() };
  },
}));

const { updateExistingSessionsForStudent } = require('@/lib/scheduling/session-requirement-sync');

/**
 * Runs the sync with unchanged requirements, which skips the duration and count
 * steps and exercises conflict detection on its own.
 *
 * Asserts the run actually succeeded before returning. `updateExistingSessionsForStudent`
 * swallows every error into `{ success: false }`, so without this a broken
 * fixture would leave `flagged` empty and every "must not flag" case below would
 * pass for the wrong reason — the exact failure these tests exist to catch.
 */
async function detectConflicts() {
  flagged = [];
  const result = await updateExistingSessionsForStudent(
    'student-1',
    { minutes_per_session: 30, sessions_per_week: 2 },
    { minutes_per_session: 30, sessions_per_week: 2 }
  );
  expect(result).toMatchObject({ success: true });
  // Detection genuinely ran and agrees with what was written.
  expect(result.conflictCount).toBe(flagged.length);
  return flagged;
}

const flaggedIds = (f: Array<{ id: string }>) => f.map(x => x.id).sort();

describe('session conflict detection respects the template/instance layers (SPE-476)', () => {
  it('does not flag an instance for overlapping its own template', async () => {
    // The exact prod shape: one Tuesday template and the dates generated from it.
    rows = [
      template('t1', 2, '10:30:00', '11:00:00'),
      instance('i1', '2026-08-04', 2, '10:30:00', '11:00:00'),
      instance('i2', '2026-08-11', 2, '10:30:00', '11:00:00'),
      instance('i3', '2026-08-18', 2, '10:30:00', '11:00:00'),
    ];
    expect(await detectConflicts()).toEqual([]);
  });

  it('does not flag instances of two different templates on the same weekday', async () => {
    // Same weekday, non-overlapping times: legitimate, and their instances
    // inherit the same non-overlap. A weekday-only comparison saw four sessions
    // on Tuesday and flagged the lot.
    rows = [
      template('t1', 2, '09:00:00', '09:30:00'),
      template('t2', 2, '10:00:00', '10:30:00'),
      instance('i1', '2026-08-04', 2, '09:00:00', '09:30:00'),
      instance('i2', '2026-08-04', 2, '10:00:00', '10:30:00'),
    ];
    expect(await detectConflicts()).toEqual([]);
  });

  it('does not flag instances on different dates that share a weekday and time', async () => {
    // Every Tuesday at 09:00 across a term is one weekly session, not a pile-up.
    rows = [
      instance('i1', '2026-08-04', 2, '09:00:00', '09:30:00'),
      instance('i2', '2026-08-11', 2, '09:00:00', '09:30:00'),
      instance('i3', '2026-08-18', 2, '09:00:00', '09:30:00'),
    ];
    expect(await detectConflicts()).toEqual([]);
  });

  it('still flags two templates that genuinely overlap on the same weekday', async () => {
    // The one real double-booking in prod had exactly this shape.
    rows = [
      template('t1', 2, '08:00:00', '08:30:00'),
      template('t2', 2, '08:10:00', '08:40:00'),
    ];
    expect(flaggedIds(await detectConflicts())).toEqual(['t1', 't2']);
  });

  it('still flags two instances that genuinely overlap on the same date', async () => {
    rows = [
      instance('i1', '2026-08-04', 2, '08:00:00', '08:30:00'),
      instance('i2', '2026-08-04', 2, '08:10:00', '08:40:00'),
    ];
    expect(flaggedIds(await detectConflicts())).toEqual(['i1', 'i2']);
  });

  it('propagates a genuine template overlap to the instances that inherit it', async () => {
    // A real double-booking should be visible on the dates it actually lands on.
    rows = [
      template('t1', 2, '08:00:00', '08:30:00'),
      template('t2', 2, '08:10:00', '08:40:00'),
      instance('i1', '2026-08-04', 2, '08:00:00', '08:30:00'),
      instance('i2', '2026-08-04', 2, '08:10:00', '08:40:00'),
    ];
    expect(flaggedIds(await detectConflicts())).toEqual(['i1', 'i2', 't1', 't2']);
  });

  it('treats back-to-back sessions as adjacent, not overlapping', async () => {
    rows = [
      template('t1', 2, '09:00:00', '09:30:00'),
      template('t2', 2, '09:30:00', '10:00:00'),
    ];
    expect(await detectConflicts()).toEqual([]);
  });

  it('keeps templates on different weekdays independent', async () => {
    rows = [
      template('t1', 1, '09:00:00', '09:30:00'),
      template('t2', 2, '09:00:00', '09:30:00'),
    ];
    expect(await detectConflicts()).toEqual([]);
  });

  it('ignores unscheduled placeholders, which have no day or time yet', async () => {
    rows = [
      template('t1', 2, '09:00:00', '09:30:00'),
      { ...template('u1', 2, '09:00:00', '09:30:00'), day_of_week: null, start_time: null, end_time: null },
    ];
    expect(await detectConflicts()).toEqual([]);
  });

  it('reports the overlap reason providers see', async () => {
    rows = [
      template('t1', 2, '08:00:00', '08:30:00'),
      template('t2', 2, '08:10:00', '08:40:00'),
    ];
    const result = await detectConflicts();
    expect(result[0].reason).toMatch(/Overlaps with another session for this student/);
  });
});
