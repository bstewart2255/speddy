/**
 * Speddy Assistant tools (SPE-450) — the read-only data layer the AI calls.
 *
 * What these tests pin, in order of how much they matter:
 *   - every query is pinned to the signed-in provider (`provider_id = userId`),
 *     so the assistant answers about the caller's caseload only;
 *   - malformed or oversized inputs are refused with a message the model can
 *     act on, never passed through to the database;
 *   - awkward data shapes (details as array vs object, goals as string vs
 *     array, missing students) come back normalized instead of crashing;
 *   - a thrown error is contained into an { ok: false } result so one bad
 *     tool call can't 500 the whole chat exchange.
 *
 * RLS itself is NOT visible here (the client is mocked) — that is exercised
 * separately against the sim district with a real signed-in session.
 */
import { executeAssistantTool, MAX_SCHEDULE_RANGE_DAYS } from '@/lib/assistant/tools';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

type QueryResult = { data: unknown; error: { message: string } | null };

// Minimal chainable, thenable stand-in for the PostgREST query builder.
function makeQuery(result: QueryResult) {
  const q: any = {
    calls: [] as Array<[string, unknown[]]>,
  };
  for (const m of ['select', 'eq', 'is', 'not', 'gte', 'lte', 'order', 'limit']) {
    q[m] = jest.fn((...args: unknown[]) => {
      q.calls.push([m, args]);
      return q;
    });
  }
  q.maybeSingle = jest.fn(async () => result);
  q.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return q;
}

// from(table) hands out queued results per table, recording each query.
function makeSupabase(resultsByTable: Record<string, QueryResult[]>) {
  const queries: Record<string, any[]> = {};
  const from = jest.fn((table: string) => {
    const queue = resultsByTable[table] ?? [];
    const result = queue.length > 1 ? queue.shift()! : queue[0] ?? { data: null, error: { message: `no mock for ${table}` } };
    const q = makeQuery(result);
    (queries[table] ??= []).push(q);
    return q;
  });
  return { client: { from } as any, from, queries };
}

const calledWith = (q: any, method: string) =>
  q.calls.filter((c: [string, unknown[]]) => c[0] === method).map((c: [string, unknown[]]) => c[1]);

describe('get_caseload', () => {
  it('maps rows, computes weekly minutes, and normalizes goal shapes', async () => {
    const { client, queries } = makeSupabase({
      students: [
        {
          data: [
            {
              id: STUDENT_ID,
              initials: 'AB',
              grade_level: '3',
              sessions_per_week: 2,
              minutes_per_session: 30,
              // details as one-element array, goals as ';'-separated string
              student_details: [{ first_name: 'Ana', last_name: 'Best', iep_goals: 'reading fluency; math facts' }],
            },
            {
              id: '44444444-4444-4444-8444-444444444444',
              initials: 'CD',
              grade_level: 'K',
              sessions_per_week: null,
              minutes_per_session: 30,
              // details as object, goals as array
              student_details: { first_name: null, last_name: null, iep_goals: ['articulation'] },
            },
          ],
          error: null,
        },
      ],
    });

    const result = await executeAssistantTool(client, USER_ID, 'get_caseload', {});
    expect(result).toEqual({
      ok: true,
      data: {
        student_count: 2,
        students: [
          {
            student_id: STUDENT_ID,
            initials: 'AB',
            name: 'Ana Best',
            grade: '3',
            sessions_per_week: 2,
            minutes_per_session: 30,
            weekly_minutes: 60,
            iep_goals: ['reading fluency', 'math facts'],
          },
          {
            student_id: '44444444-4444-4444-8444-444444444444',
            initials: 'CD',
            name: null,
            grade: 'K',
            sessions_per_week: null,
            minutes_per_session: 30,
            weekly_minutes: null,
            iep_goals: ['articulation'],
          },
        ],
      },
    });

    // The load-bearing filter: scoped to the signed-in provider.
    expect(calledWith(queries.students[0], 'eq')).toContainEqual(['provider_id', USER_ID]);
  });

  it('surfaces a database error as ok:false', async () => {
    const { client } = makeSupabase({ students: [{ data: null, error: { message: 'boom' } }] });
    const result = await executeAssistantTool(client, USER_ID, 'get_caseload', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('boom');
  });
});

describe('get_schedule', () => {
  const input = { start_date: '2026-08-10', end_date: '2026-08-14' };

  it('refuses malformed dates without querying', async () => {
    const { client, from } = makeSupabase({});
    const result = await executeAssistantTool(client, USER_ID, 'get_schedule', {
      start_date: 'next monday',
      end_date: '2026-08-14',
    });
    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses an inverted range', async () => {
    const { client } = makeSupabase({});
    const result = await executeAssistantTool(client, USER_ID, 'get_schedule', {
      start_date: '2026-08-14',
      end_date: '2026-08-10',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('on or after');
  });

  it(`refuses a range longer than ${MAX_SCHEDULE_RANGE_DAYS} days`, async () => {
    const { client } = makeSupabase({});
    const result = await executeAssistantTool(client, USER_ID, 'get_schedule', {
      start_date: '2026-08-01',
      end_date: '2026-09-15',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('at most');
  });

  it('maps sessions, truncates long notes, and scopes the query to the provider and range', async () => {
    const longNote = 'x'.repeat(600);
    const { client, queries } = makeSupabase({
      schedule_sessions: [
        {
          data: [
            {
              session_date: '2026-08-10',
              start_time: '09:00:00',
              end_time: '09:30:00',
              service_type: 'speech',
              delivered_by: 'provider',
              is_completed: true,
              session_notes: longNote,
              students: { initials: 'AB', grade_level: '3' },
            },
            {
              session_date: '2026-08-11',
              start_time: '10:00:00',
              end_time: '10:30:00',
              service_type: 'speech',
              delivered_by: 'sea',
              is_completed: false,
              session_notes: null,
              students: null,
            },
          ],
          error: null,
        },
      ],
    });

    const result = await executeAssistantTool(client, USER_ID, 'get_schedule', input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as any;
      expect(data.session_count).toBe(2);
      expect(data.truncated).toBe(false);
      expect(data.sessions[0].notes).toHaveLength(501); // 500 chars + ellipsis
      expect(data.sessions[0].completed).toBe(true);
      expect(data.sessions[1].student_initials).toBeNull();
    }

    const q = queries.schedule_sessions[0];
    expect(calledWith(q, 'eq')).toContainEqual(['provider_id', USER_ID]);
    expect(calledWith(q, 'gte')).toContainEqual(['session_date', '2026-08-10']);
    expect(calledWith(q, 'lte')).toContainEqual(['session_date', '2026-08-14']);
    expect(calledWith(q, 'is')).toContainEqual(['deleted_at', null]);
  });
});

describe('get_student_info', () => {
  it('refuses a non-uuid id without querying', async () => {
    const { client, from } = makeSupabase({});
    const result = await executeAssistantTool(client, USER_ID, 'get_student_info', {
      student_id: 'AB; DROP TABLE students',
    });
    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('reports a student that is not on the caseload', async () => {
    const { client } = makeSupabase({ students: [{ data: null, error: null }] });
    const result = await executeAssistantTool(client, USER_ID, 'get_student_info', {
      student_id: STUDENT_ID,
    });
    expect(result).toEqual({ ok: false, error: 'No student with that id is on your caseload.' });
  });

  it('returns the student with goals and weekly slots, scoped to the provider', async () => {
    const { client, queries } = makeSupabase({
      students: [
        {
          data: {
            id: STUDENT_ID,
            initials: 'AB',
            grade_level: '3',
            sessions_per_week: 2,
            minutes_per_session: 30,
            student_details: { first_name: 'Ana', last_name: 'Best', iep_goals: ['reading fluency'] },
          },
          error: null,
        },
      ],
      schedule_sessions: [
        {
          data: [
            { day_of_week: 1, start_time: '09:00:00', end_time: '09:30:00', service_type: 'speech' },
            { day_of_week: 3, start_time: '13:00:00', end_time: '13:30:00', service_type: 'speech' },
          ],
          error: null,
        },
      ],
    });

    const result = await executeAssistantTool(client, USER_ID, 'get_student_info', {
      student_id: STUDENT_ID,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        student_id: STUDENT_ID,
        initials: 'AB',
        name: 'Ana Best',
        grade: '3',
        sessions_per_week: 2,
        minutes_per_session: 30,
        weekly_minutes: 60,
        iep_goals: ['reading fluency'],
        weekly_slots: [
          { day_of_week: 1, start_time: '09:00:00', end_time: '09:30:00', service_type: 'speech' },
          { day_of_week: 3, start_time: '13:00:00', end_time: '13:30:00', service_type: 'speech' },
        ],
      },
    });

    expect(calledWith(queries.students[0], 'eq')).toContainEqual(['provider_id', USER_ID]);
    expect(calledWith(queries.schedule_sessions[0], 'eq')).toContainEqual(['provider_id', USER_ID]);
    expect(calledWith(queries.schedule_sessions[0], 'eq')).toContainEqual(['is_template', true]);
  });
});

describe('executeAssistantTool', () => {
  it('refuses an unknown tool name', async () => {
    const { client } = makeSupabase({});
    const result = await executeAssistantTool(client, USER_ID, 'delete_everything', {});
    expect(result).toEqual({ ok: false, error: 'Unknown tool: delete_everything' });
  });

  it('contains a thrown error into ok:false', async () => {
    const client = {
      from: () => {
        throw new Error('connection reset');
      },
    } as any;
    const result = await executeAssistantTool(client, USER_ID, 'get_caseload', {});
    expect(result).toEqual({ ok: false, error: 'Tool failed: connection reset' });
  });
});
