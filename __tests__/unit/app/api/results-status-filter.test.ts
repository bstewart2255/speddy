/**
 * GET /api/exit-tickets/results and GET /api/progress-check/results (SPE-76).
 *
 * Both routes used to call `.range(offset, offset + limit - 1)` on the
 * *unfiltered* query and only apply the `status` filter afterward, in memory.
 * That meant a filtered page could come back short or empty even when
 * matching rows existed later in the (unfiltered) dataset — the DB-level
 * page just didn't happen to contain any of them.
 *
 * These tests pin that the `status` predicate is now applied at the database
 * level, before `.range()`: build a fixture where the first two DB rows (in
 * `created_at desc` order) do NOT match `status=graded`, but two later rows
 * do. A `limit=2&offset=0&status=graded` request must return those two
 * matching rows, not an empty page.
 */
import { NextRequest } from 'next/server';

const USER_ID = '11111111-1111-4111-8111-111111111111';

interface Row {
  id: string;
  student_id: string;
  content: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
  discarded_at: string | null;
}

// Fixture in DB return order (created_at desc). T1/T2 are ungraded, T3 is
// discarded, T4/T5 are graded — the graded rows sit *after* where a
// limit=2/offset=0 page would land if status were still applied post-range.
let rows: Row[] = [];

function freshRows(): Row[] {
  return [
    { id: 'T1', student_id: 'S1', content: {}, created_at: '2026-08-05', completed_at: null, discarded_at: null },
    { id: 'T2', student_id: 'S1', content: {}, created_at: '2026-08-04', completed_at: null, discarded_at: null },
    { id: 'T3', student_id: 'S1', content: {}, created_at: '2026-08-03', completed_at: null, discarded_at: '2026-08-03T12:00:00.000Z' },
    { id: 'T4', student_id: 'S1', content: {}, created_at: '2026-08-02', completed_at: '2026-08-02T12:00:00.000Z', discarded_at: null },
    { id: 'T5', student_id: 'S1', content: {}, created_at: '2026-08-01', completed_at: '2026-08-01T12:00:00.000Z', discarded_at: null },
  ];
}

// Minimal Supabase query-builder stand-in: `eq`/`is`/`not`/`in` narrow an
// in-memory array, `range` slices it, and the object is awaitable via
// `.then` — mirroring how the real chain resolves when awaited directly.
function makeQueryable(source: Row[]) {
  let filtered = [...source];
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    eq: (col: keyof Row, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return api;
    },
    in: (col: keyof Row, vals: unknown[]) => {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return api;
    },
    is: (col: keyof Row, val: null) => {
      filtered = filtered.filter((r) => r[col] === val);
      return api;
    },
    not: (col: keyof Row, _op: 'is', val: null) => {
      filtered = filtered.filter((r) => r[col] !== val);
      return api;
    },
    range: (start: number, end: number) => {
      filtered = filtered.slice(start, end + 1);
      return api;
    },
    then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: filtered, error: null }),
  };
  return api;
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: () => makeQueryable(rows),
  }),
}));

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET as getExitTicketResults } from '@/app/api/exit-tickets/results/route';
import { GET as getProgressCheckResults } from '@/app/api/progress-check/results/route';

const routes = [
  { name: 'exit-tickets', handler: getExitTicketResults, path: 'exit-tickets/results', resultsKey: 'tickets' },
  { name: 'progress-check', handler: getProgressCheckResults, path: 'progress-check/results', resultsKey: 'checks' },
] as const;

const call = (handler: (typeof routes)[number]['handler'], path: string, qs: string) =>
  handler(new NextRequest(`http://localhost/api/${path}?${qs}`));

describe.each(routes)('GET /api/$name/results status filter (SPE-76)', ({ handler, path, resultsKey }) => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    rows = freshRows();
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the matching graded page even though it is not the first DB page', async () => {
    const res = await call(handler, path, 'status=graded&limit=2&offset=0');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[resultsKey].map((r: { id: string }) => r.id)).toEqual(['T4', 'T5']);
  });

  it('filters to needs_grading before paginating', async () => {
    const res = await call(handler, path, 'status=needs_grading&limit=1&offset=0');

    const body = await res.json();
    expect(body[resultsKey].map((r: { id: string }) => r.id)).toEqual(['T1']);
  });

  it('paginates within the needs_grading filter using offset', async () => {
    const res = await call(handler, path, 'status=needs_grading&limit=1&offset=1');

    const body = await res.json();
    expect(body[resultsKey].map((r: { id: string }) => r.id)).toEqual(['T2']);
  });

  it('filters to discarded rows regardless of grading state', async () => {
    const res = await call(handler, path, 'status=discarded&limit=10&offset=0');

    const body = await res.json();
    expect(body[resultsKey].map((r: { id: string }) => r.id)).toEqual(['T3']);
  });

  it('returns every row, unfiltered, when status is omitted', async () => {
    const res = await call(handler, path, 'limit=10&offset=0');

    const body = await res.json();
    expect(body[resultsKey].map((r: { id: string }) => r.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
  });
});
