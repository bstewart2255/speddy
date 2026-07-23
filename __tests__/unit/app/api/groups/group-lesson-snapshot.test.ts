/**
 * Groups v2 · Phase 0 (SPE-308) — group-lesson saves snapshot participants.
 *
 * Group lessons previously snapshotted nothing, so once a group was reshuffled
 * the lesson lost all record of who it was for. The fix populates the existing
 * `student_ids[]` + `student_details` columns (the pattern AI lessons already
 * use) from the group's current members at write time.
 *
 * These tests drive the real route handler through a recording Supabase stub and
 * assert the write payload carries a non-empty, de-duplicated snapshot on both
 * the create and update paths.
 */
import { NextRequest } from 'next/server';

const PROVIDER = 'prov-1';
const GROUP = 'group-1';

interface Write {
  op: 'insert' | 'update';
  payload: any;
}
let writes: Write[] = [];
let existingLesson: { id: string; lesson_date: string } | null = null;

// Group members (note the duplicate student A across two template rows — the
// snapshot must de-dupe by student_id).
const memberRows = [
  { student_id: 'A', students: { id: 'A', initials: 'AB', grade_level: '3' } },
  { student_id: 'B', students: { id: 'B', initials: 'CD', grade_level: '4' } },
  { student_id: 'A', students: { id: 'A', initials: 'AB', grade_level: '3' } },
];

function makeBuilder(table: string) {
  const state = { op: 'select' as 'select' | 'insert' | 'update' | 'delete', cols: '', payload: undefined as any };
  const builder: any = {};
  const passthrough = () => builder;
  builder.select = (cols?: string) => { state.cols = cols ?? ''; return builder; };
  builder.insert = (payload: any) => { state.op = 'insert'; state.payload = payload; return builder; };
  builder.update = (payload: any) => { state.op = 'update'; state.payload = payload; return builder; };
  builder.delete = () => { state.op = 'delete'; return builder; };
  for (const m of ['eq', 'in', 'is', 'not', 'gte', 'or', 'order', 'limit']) builder[m] = passthrough;
  builder.single = () => builder;
  builder.maybeSingle = () => builder;

  const resolve = () => {
    if (table === 'schedule_sessions' && state.op === 'select') {
      if (state.cols.includes('students(')) return { data: memberRows, error: null };
      return { data: [{ id: 'session-1' }], error: null }; // access check
    }
    if (table === 'lessons') {
      if (state.op === 'select') return { data: existingLesson, error: null };
      if (state.op === 'insert' || state.op === 'update') {
        writes.push({ op: state.op, payload: state.payload });
        return { data: { id: 'lesson-1', ...state.payload }, error: null };
      }
    }
    return { data: null, error: null };
  };
  builder.then = (onF: (r: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onF, onR);
  return builder;
}

const mockGetUser = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => makeBuilder(table),
  }),
}));

import { POST } from '@/app/api/groups/[groupId]/lesson/route';

const makeRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/groups/group-1/lesson', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ groupId: GROUP }) };

describe('POST /api/groups/[groupId]/lesson — participant snapshot (SPE-308)', () => {
  beforeEach(() => {
    writes = [];
    existingLesson = null;
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: PROVIDER } }, error: null });
  });

  it('writes a non-empty, de-duplicated snapshot when creating a group lesson', async () => {
    const res = await POST(makeRequest({ content: { blocks: [] }, lesson_date: '2026-07-23' }), ctx);
    expect(res.status).toBe(201);

    expect(writes).toHaveLength(1);
    const { op, payload } = writes[0];
    expect(op).toBe('insert');
    expect(payload.student_ids).toEqual(['A', 'B']);
    expect(payload.student_details).toEqual([
      { id: 'A', initials: 'AB', grade_level: '3' },
      { id: 'B', initials: 'CD', grade_level: '4' },
    ]);
  });

  it('re-snapshots current members when updating an existing group lesson', async () => {
    existingLesson = { id: 'lesson-1', lesson_date: '2026-07-23' };

    const res = await POST(makeRequest({ content: { blocks: [] }, lesson_date: '2026-07-23' }), ctx);
    expect(res.status).toBe(200);

    expect(writes).toHaveLength(1);
    const { op, payload } = writes[0];
    expect(op).toBe('update');
    expect(payload.student_ids).toEqual(['A', 'B']);
    expect(payload.student_details).toHaveLength(2);
  });
});
