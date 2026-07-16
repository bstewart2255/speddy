/**
 * Unit tests for the per-student IEP goals confirm route (SPE-259).
 *
 * The route now delegates the read-merge-write to the atomic `merge_iep_goals`
 * RPC. These tests mock the RPC and pin the route's contract: normalized entries
 * in, RPC result rows mapped back to input-ordered per-row results (keyed by
 * `ord`, robust to row order), and the error/edge paths. The merge semantics
 * themselves live in SQL (mirrored by lib/import/merge-goals.ts) and are
 * validated against the database.
 */
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}));
jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/import-iep-goals/confirm/route';

const USER_ID = 'provider-1';

type RpcRow = { ord: number; success: boolean; error_message: string | null };
type RpcResult = { data: RpcRow[] | null; error: unknown };

function makeSupabase(rpcResult: RpcResult) {
  const rpc = jest.fn(async () => rpcResult);
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    rpc,
  };
}

function request(bodyObj: unknown) {
  return {
    url: 'http://localhost/api/import-iep-goals/confirm',
    method: 'POST',
    json: async () => bodyObj,
  } as unknown as Request;
}

async function run(supabase: ReturnType<typeof makeSupabase>, bodyObj: unknown) {
  (createClient as jest.Mock).mockResolvedValue(supabase);
  const res = await POST(request(bodyObj) as unknown as Parameters<typeof POST>[0]);
  const body = await res.json();
  return { status: res.status, body };
}

const okRow = (ord: number): RpcRow => ({ ord, success: true, error_message: null });

describe('POST /api/import-iep-goals/confirm (SPE-259)', () => {
  it('returns 400 when no students are provided', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    for (const body of [{}, { students: [] }, { students: 'nope' }]) {
      const { status } = await run(supabase, body);
      expect(status).toBe(400);
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('normalizes entries and calls merge_iep_goals with the provider id', async () => {
    const supabase = makeSupabase({ data: [okRow(0)], error: null });
    await run(supabase, {
      students: [
        // goals filtered to strings; empty iepDate dropped to null; extra fields ignored
        { studentId: 's1', goals: ['A', 42, 'B', null], iepDate: '', extra: 'x' },
      ],
    });
    expect(supabase.rpc).toHaveBeenCalledWith('merge_iep_goals', {
      p_provider_id: USER_ID,
      p_entries: [{ studentId: 's1', goals: ['A', 'B'], iepDate: null }],
    });
  });

  it('maps RPC rows to input-ordered results and preserves the response shape', async () => {
    const supabase = makeSupabase({
      data: [okRow(0), { ord: 1, success: false, error_message: 'Student not found in your caseload' }, okRow(2)],
      error: null,
    });
    const { status, body } = await run(supabase, {
      students: [
        { studentId: 's1', goals: ['A'] },
        { studentId: 'bad', goals: ['B'] },
        { studentId: 's3', goals: ['C'] },
      ],
    });
    expect(status).toBe(200);
    expect(body).toEqual({
      data: {
        results: [
          { success: true },
          { success: false, error: 'Student not found in your caseload' },
          { success: true },
        ],
      },
    });
  });

  it('maps by ord even when the RPC returns rows out of order', async () => {
    const supabase = makeSupabase({
      data: [okRow(2), okRow(0), { ord: 1, success: false, error_message: 'Failed to save goals' }],
      error: null,
    });
    const { body } = await run(supabase, {
      students: [
        { studentId: 's1', goals: ['A'] },
        { studentId: 's2', goals: ['B'] },
        { studentId: 's3', goals: ['C'] },
      ],
    });
    expect((body as { data: { results: unknown[] } }).data.results).toEqual([
      { success: true },
      { success: false, error: 'Failed to save goals' },
      { success: true },
    ]);
  });

  it('defaults a missing RPC row to a failure (never silently "saved")', async () => {
    const supabase = makeSupabase({ data: [okRow(0)], error: null }); // no row for index 1
    const { body } = await run(supabase, {
      students: [
        { studentId: 's1', goals: ['A'] },
        { studentId: 's2', goals: ['B'] },
      ],
    });
    expect((body as { data: { results: Array<{ success: boolean }> } }).data.results).toEqual([
      { success: true },
      { success: false, error: 'Failed to save goals' },
    ]);
  });

  it('returns 500 when the RPC itself errors', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'boom' } });
    const { status, body } = await run(supabase, { students: [{ studentId: 's1', goals: ['A'] }] });
    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Failed to save goals' });
  });
});
