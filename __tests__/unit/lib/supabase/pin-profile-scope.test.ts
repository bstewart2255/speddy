/**
 * SPE-570 · `pinProfileScopeFromSchool` — the guard that keeps admin- and
 * SIS-provisioned profiles from landing district-less.
 *
 * These assertions exist because the bug they pin was invisible for months:
 * four creation paths wrote `school_id` alone, `create_profile_for_new_user`
 * had already resolved nothing (it name-matches on district/state strings the
 * callers pass as ''), and the result was 114 production profiles with a
 * school but no district and no state. Nothing failed loudly — the accounts
 * worked, they were simply missing from every district-level count.
 *
 * So the write shape is the contract: all THREE ids, every time, or throw.
 */

import { pinProfileScopeFromSchool } from '@/lib/supabase/pin-profile-scope';

interface RecordedQuery {
  table: string;
  calls: { method: string; args: unknown[] }[];
}

/**
 * Minimal query-builder stub that records the chain and resolves to whatever
 * `results[table]` says. Mirrors the real builder's thenable behavior.
 */
function makeClient(results: Record<string, { data: unknown; error: unknown }>) {
  const recorded: RecordedQuery[] = [];
  const client = {
    from(table: string) {
      const record: RecordedQuery = { table, calls: [] };
      recorded.push(record);
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'update', 'eq', 'single']) {
        chain[method] = (...args: unknown[]) => {
          record.calls.push({ method, args });
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(results[table] ?? { data: null, error: null }).then(resolve);
      return chain;
    },
  };
  return { client, recorded };
}

const HAPPY = {
  schools: { data: { district_id: 'dist-9' }, error: null },
  districts: { data: { state_id: 'CA' }, error: null },
  profiles: { data: [{ id: 'user-1' }], error: null },
};

describe('pinProfileScopeFromSchool', () => {
  it('writes school, district AND state — never school alone', async () => {
    const { client, recorded } = makeClient(HAPPY);

    await pinProfileScopeFromSchool(client as never, 'user-1', 'sch-1');

    const update = recorded.find((q) => q.table === 'profiles');
    expect(update).toBeDefined();
    const payload = update!.calls.find((c) => c.method === 'update')!.args[0];
    // Exact equality, not a subset match: a future edit that drops a column
    // has to fail here rather than quietly pass a looser assertion.
    expect(payload).toEqual({
      school_id: 'sch-1',
      district_id: 'dist-9',
      state_id: 'CA',
    });
    expect(update!.calls).toContainEqual({ method: 'eq', args: ['id', 'user-1'] });
  });

  it('derives state from the district, not from the caller', async () => {
    const { client, recorded } = makeClient(HAPPY);

    await pinProfileScopeFromSchool(client as never, 'user-1', 'sch-1');

    // The district is read by the school's district_id — the reference-table
    // chain. admin_permissions.state_id is NOT normalized in production
    // (it holds both 'CA' and 'ca'), which is why it is not the source here.
    const districtRead = recorded.find((q) => q.table === 'districts');
    expect(districtRead!.calls).toContainEqual({ method: 'eq', args: ['id', 'dist-9'] });
  });

  it('throws when the school resolves to no district', async () => {
    const { client } = makeClient({
      ...HAPPY,
      schools: { data: null, error: { message: 'not found' } },
    });

    await expect(pinProfileScopeFromSchool(client as never, 'user-1', 'sch-1')).rejects.toThrow(
      /could not resolve a district for school sch-1/
    );
  });

  it('throws when the district resolves to no state', async () => {
    const { client } = makeClient({
      ...HAPPY,
      districts: { data: null, error: null },
    });

    await expect(pinProfileScopeFromSchool(client as never, 'user-1', 'sch-1')).rejects.toThrow(
      /could not resolve a state for district dist-9/
    );
  });

  it('throws when the update reports an error', async () => {
    const { client } = makeClient({
      ...HAPPY,
      profiles: { data: null, error: { message: 'permission denied' } },
    });

    await expect(pinProfileScopeFromSchool(client as never, 'user-1', 'sch-1')).rejects.toThrow(
      /Profile scoping update failed: permission denied/
    );
  });

  it('throws when the update touches NO row, despite reporting no error', async () => {
    // PostgREST answers a filtered-out UPDATE with 2xx and an empty body, so
    // "no error" is not evidence the write landed. This case is the whole
    // reason the helper selects back the id.
    const { client } = makeClient({
      ...HAPPY,
      profiles: { data: [], error: null },
    });

    await expect(pinProfileScopeFromSchool(client as never, 'user-1', 'sch-1')).rejects.toThrow(
      /affected no row for profile user-1/
    );
  });
});
