/**
 * SPE-305: the scheduling load must not call `get_scheduling_data_batch`.
 *
 * That RPC never delivered data to the client. As committed it returned
 * camelCase keys the caller's snake_case tests never matched, so nothing was
 * cached (SPE-56); after an uncaptured rewrite its work_schedule CTE compared
 * a uuid column to a text argument, so Postgres rejected it at plan time on
 * every call (documented in the live body by 2026-07-22). Either way the app
 * fell through to the parallel queries, and the RPC call was a wasted round
 * trip on every schedule load. The function is now dropped from the database,
 * so a re-added call would 404 rather than 42883.
 *
 * The bigger risk is someone "restoring the optimization": a single-statement
 * version has to carry the school_id/school_site dual key (SPE-463), the
 * school_year scope (SPE-458), the deleted_at filter (SPE-468/SPE-484) and the
 * caller's expected key names (SPE-56), or it silently under-reads and the
 * auto-scheduler books over protected time. This test makes that a deliberate
 * decision rather than an accident. All data is fictional.
 */

const mockState: { rpcCalls: string[]; tables: string[] } = { rpcCalls: [], tables: [] };

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: (fn: string) => {
      mockState.rpcCalls.push(fn);
      const builder: Record<string, unknown> = {
        single: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: null })),
      };
      return builder;
    },
    from: (table: string) => {
      mockState.tables.push(table);
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'is', 'in', 'or', 'not', 'gte', 'lte', 'order', 'limit']) {
        query[method] = () => query;
      }
      query.single = () => Promise.resolve({ data: null, error: null });
      query.maybeSingle = () => Promise.resolve({ data: null, error: null });
      query.then = (resolve: (r: unknown) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null }));
      return query;
    },
  }),
}));

import { SchedulingDataManager } from '@/lib/scheduling/scheduling-data-manager';

beforeEach(() => {
  mockState.rpcCalls = [];
  mockState.tables = [];
});

describe('SchedulingDataManager batch RPC removal (SPE-305)', () => {
  it('loads scheduling data without calling get_scheduling_data_batch', async () => {
    const manager = SchedulingDataManager.getInstance() as unknown as {
      providerId: string | null;
      schoolSite: string | null;
      schoolDistrict: string | null;
      schoolId: string | null;
      loadAllData: () => Promise<void>;
    };
    manager.providerId = '11111111-1111-1111-1111-111111111111';
    manager.schoolSite = 'Fictional Elementary';
    manager.schoolDistrict = 'Fictional Unified';
    manager.schoolId = '000000000000';

    await manager.loadAllData();

    expect(mockState.rpcCalls).not.toContain('get_scheduling_data_batch');
    // The parallel reads are what should have run instead.
    expect(mockState.tables).toContain('bell_schedules');
  });
});
