/**
 * Groups v2 · Phase 4/5 (SPE-313/315) — the group-lesson route reads group
 * content by the durable `group_ref` (with a legacy `group_id` fallback for the
 * dual-write bake), and a malformed group id can never reach the interpolated
 * PostgREST `.or()` filter (injection guard). This is the regression net for the
 * rekey that will let Phase 5 drop the legacy column without losing lessons.
 */
import { NextRequest } from 'next/server';

const USER = 'prov-1';
// Canonical 8-4-4-4-12 UUID.
const GROUP = 'ad29f870-d9cb-4bad-aa35-9bd705100c05';
const EXPECTED_FILTER = `group_ref.eq.${GROUP},group_id.eq.${GROUP}`;

const orFilters: string[] = [];
const queriedTables: string[] = [];
let lessonsSelected = 0;
const mockGetUser = jest.fn();

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const pass = () => b;
  b.select = () => {
    if (table === 'lessons') lessonsSelected++;
    return b;
  };
  b.or = (arg: string) => {
    orFilters.push(arg);
    return b;
  };
  for (const m of ['eq', 'in', 'is', 'not', 'gte', 'order', 'limit', 'delete']) b[m] = pass;
  b.maybeSingle = () => b;
  b.single = () => b;
  b.then = (onF: (r: unknown) => unknown, onR?: (e: unknown) => unknown) => {
    // hasGroupAccess grants when the session_groups record resolves (owner path).
    const data = table === 'session_groups' ? { id: GROUP } : null;
    return Promise.resolve({ data, error: null }).then(onF, onR);
  };
  return b;
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (t: string) => {
      queriedTables.push(t);
      return makeBuilder(t);
    },
  }),
}));

import { GET, DELETE } from '@/app/api/groups/[groupId]/lesson/route';

const ctx = (groupId: string) => ({ params: Promise.resolve({ groupId }) });
const getReq = () => new NextRequest('http://localhost/api/groups/x/lesson');
const delReq = () => new NextRequest('http://localhost/api/groups/x/lesson', { method: 'DELETE' });

describe('group lesson route — durable group_ref read + UUID guard (SPE-313/315)', () => {
  beforeEach(() => {
    orFilters.length = 0;
    queriedTables.length = 0;
    lessonsSelected = 0;
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: USER } }, error: null });
  });

  it('GET reads lessons by group_ref OR legacy group_id', async () => {
    const res = await GET(getReq(), ctx(GROUP));
    expect(res.status).toBe(200);
    expect(orFilters).toContain(EXPECTED_FILTER);
  });

  it('DELETE targets lessons by group_ref OR legacy group_id', async () => {
    const res = await DELETE(delReq(), ctx(GROUP));
    expect(res.status).toBe(200);
    expect(orFilters).toContain(EXPECTED_FILTER);
  });

  it('GET short-circuits a non-uuid group id: empty result, no query, no interpolation', async () => {
    const res = await GET(getReq(), ctx('not-a-uuid; provider_id.eq.evil'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lesson: null });
    expect(orFilters).toHaveLength(0);
    expect(lessonsSelected).toBe(0);
    expect(queriedTables).toHaveLength(0); // no DB access at all before the guard
  });

  it('DELETE is a no-op success for a non-uuid group id (nothing to delete)', async () => {
    const res = await DELETE(delReq(), ctx('not-a-uuid'));
    expect(res.status).toBe(200);
    expect(orFilters).toHaveLength(0);
    expect(queriedTables).toHaveLength(0);
  });
});
