/**
 * Groups v2 · Phase 0 (SPE-308) — ungroup must NOT rewrite past-dated instances.
 *
 * The bug: the ungroup route cleared group_id/group_name/group_color on ALL
 * date-specific instances of an ungrouped template (filter was only
 * `.not('session_date','is',null)`, no date floor), erasing historical group
 * linkage on delivered sessions. The fix scopes every instance-clearing UPDATE
 * with `session_date >= today`, so past instances keep their group columns.
 *
 * This test drives the real route handler through a recording Supabase stub and
 * asserts that every instance-targeting UPDATE (the ones filtered by the natural
 * key + `.not('session_date','is',null)`) also carries the `gte('session_date',
 * <today>)` floor — covering BOTH the auto-dissolve path and the main
 * template->instance cleanup path in a single scenario.
 */
import { NextRequest } from 'next/server';

const PROVIDER = 'prov-1';
const today = new Date().toISOString().split('T')[0];

// The route rejects non-UUID session ids, so use UUID-shaped ids.
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

// Recorded builders for post-hoc assertions.
type Filter = { method: string; args: unknown[] };
interface RecordedCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload: unknown;
  selected: boolean;
  filters: Filter[];
}
let calls: RecordedCall[] = [];

// Group G has two templates: T1 (student A) and T2 (student B). Ungrouping T1
// leaves one template (T2) -> triggers the auto-dissolve path for T2 AND the
// main cleanup path for T1, so both instance-clearing UPDATEs run.
const existing: Record<string, any> = {
  [T1]: {
    id: T1, provider_id: PROVIDER, delivered_by: 'provider',
    assigned_to_specialist_id: null, assigned_to_sea_id: null,
    group_id: 'G', group_name: 'Reading', student_id: 'A',
    day_of_week: 1, start_time: '09:00:00', session_date: null,
  },
  [T2]: {
    id: T2, provider_id: PROVIDER, delivered_by: 'provider',
    assigned_to_specialist_id: null, assigned_to_sea_id: null,
    group_id: 'G', group_name: 'Reading', student_id: 'B',
    day_of_week: 2, start_time: '10:00:00', session_date: null,
  },
};
// After T1 is ungrouped, one template (T2) remains in group G.
const remainingTemplatesByGroup: Record<string, Array<{ id: string }>> = { G: [{ id: T2 }] };

function resolve(b: RecordedCall) {
  const find = (m: string, col: string) => b.filters.find(f => f.method === m && f.args[0] === col);
  const has = (m: string, col: string) => !!find(m, col);

  if (b.table === 'schedule_sessions') {
    if (b.op === 'select') {
      if (has('in', 'id')) {
        const ids = find('in', 'id')!.args[1] as string[];
        return { data: ids.map(id => existing[id]).filter(Boolean), error: null };
      }
      if (has('eq', 'id')) {
        const id = find('eq', 'id')!.args[1] as string;
        return { data: existing[id] ?? null, error: null };
      }
      if (has('eq', 'group_id')) {
        const g = find('eq', 'group_id')!.args[1] as string;
        return { data: remainingTemplatesByGroup[g] ?? [], error: null };
      }
      return { data: [], error: null };
    }
    if (b.op === 'update') {
      if (has('in', 'id') && b.selected) {
        const ids = find('in', 'id')!.args[1] as string[];
        return { data: ids.map(id => existing[id]).filter(Boolean), error: null };
      }
      return { data: null, error: null };
    }
  }
  return { data: null, error: null };
}

function makeBuilder(table: string) {
  const call: RecordedCall = { table, op: 'select', payload: undefined, selected: false, filters: [] };
  calls.push(call);
  const builder: any = {};
  const chain = (method: string) => (...args: unknown[]) => {
    if (method === 'select') call.selected = true;
    else call.filters.push({ method, args });
    return builder;
  };
  builder.select = (...args: unknown[]) => { call.selected = true; return builder; };
  builder.insert = (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; };
  builder.update = (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; };
  builder.delete = () => { call.op = 'delete'; return builder; };
  for (const m of ['eq', 'in', 'is', 'not', 'gte', 'lte', 'or', 'order', 'limit']) builder[m] = chain(m);
  builder.single = () => builder;
  builder.maybeSingle = () => builder;
  builder.then = (onF: (r: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(resolve(call)).then(onF, onR);
  return builder;
}

const mockGetUser = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => makeBuilder(table),
  }),
}));

import { POST } from '@/app/api/sessions/ungroup/route';

const makeRequest = (sessionIds: string[]) =>
  new NextRequest('http://localhost/api/sessions/ungroup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionIds }),
  });

describe('POST /api/sessions/ungroup — past-instance date floor (SPE-308)', () => {
  beforeEach(() => {
    calls = [];
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: PROVIDER } }, error: null });
  });

  it('scopes every instance-clearing UPDATE with a session_date >= today floor', async () => {
    const res = await POST(makeRequest([T1]));
    expect(res.status).toBe(200);

    // Instance-clearing UPDATEs are the ones filtered by the natural key with
    // `.not('session_date','is',null)` (i.e. targeting dated instances).
    const instanceClears = calls.filter(
      c => c.op === 'update' && c.filters.some(f => f.method === 'not' && f.args[0] === 'session_date')
    );

    // Both paths fire: auto-dissolve of the last remaining template (T2) and the
    // main cleanup of the explicitly ungrouped template (T1).
    expect(instanceClears.length).toBe(2);

    for (const clear of instanceClears) {
      const gte = clear.filters.find(f => f.method === 'gte' && f.args[0] === 'session_date');
      expect(gte).toBeDefined();
      expect(gte!.args[1]).toBe(today);
      // And it still nulls out the group columns.
      expect(clear.payload).toMatchObject({ group_id: null, group_name: null, group_color: null });
    }
  });

  it('does NOT put a date floor on the explicit .in(id) template update (past templates have no session_date)', async () => {
    await POST(makeRequest([T1]));

    // The user-selected update targets rows by id; it must not be date-gated.
    const explicitUpdate = calls.find(
      c => c.op === 'update' && c.filters.some(f => f.method === 'in' && f.args[0] === 'id') && c.selected
    );
    expect(explicitUpdate).toBeDefined();
    expect(explicitUpdate!.filters.some(f => f.method === 'gte')).toBe(false);
  });
});
