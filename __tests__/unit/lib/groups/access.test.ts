/**
 * Groups v2 · Phase 2 (SPE-311) — group content access authorizes via the
 * durable group record (group_ref chain), with a legacy live-membership fallback
 * during the dual-write bake. Both reads are RLS-gated in production; this test
 * drives the branch logic through a controllable stub.
 */
import { hasGroupAccess } from '@/lib/groups/access';

const GROUP = 'group-legacy-1';
const USER = 'prov-1';

// Controllable stub responses.
let refRow: { group_ref: string } | null;
let lessonRefRow: { group_ref: string } | null;
let sessionGroupRow: { id: string } | null;
let legacyRows: Array<{ id: string }>;

function fakeSupabase() {
  const from = (table: string) => {
    const state = { table, cols: '' };
    const b: Record<string, unknown> = {};
    b.select = (cols: string) => { state.cols = cols; return b; };
    for (const m of ['eq', 'not', 'is', 'or', 'limit']) b[m] = () => b;
    b.maybeSingle = () => b;
    b.then = (resolve: (r: unknown) => unknown) => {
      let data: unknown = null;
      if (table === 'session_groups') data = sessionGroupRow;
      else if (table === 'lessons') data = lessonRefRow;
      else if (table === 'schedule_sessions') data = state.cols === 'group_ref' ? refRow : legacyRows;
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return b;
  };
  return { from } as never;
}

describe('hasGroupAccess (SPE-311)', () => {
  beforeEach(() => {
    refRow = null;
    lessonRefRow = null;
    sessionGroupRow = null;
    legacyRows = [];
  });

  it('grants access via the durable group record (owner/assignee), even with no live membership', async () => {
    // group_ref resolves to a record the RLS-gated select returns → authorized,
    // regardless of legacy membership (empty here).
    refRow = { group_ref: 'record-uuid' };
    sessionGroupRow = { id: 'record-uuid' };
    legacyRows = [];

    expect(await hasGroupAccess(fakeSupabase(), GROUP, USER)).toBe(true);
  });

  it('resolves the durable record via the lesson ref when the sessions are gone (dissolved group)', async () => {
    // No session carries the legacy id anymore, but the saved group lesson still
    // points at the durable record — the owner must keep access to it.
    refRow = null;
    lessonRefRow = { group_ref: 'record-uuid' };
    sessionGroupRow = { id: 'record-uuid' };
    legacyRows = [];

    expect(await hasGroupAccess(fakeSupabase(), GROUP, USER)).toBe(true);
  });

  it('grants access when session_groups is identity-mapped to the legacy group id (backfilled)', async () => {
    // No group_ref anywhere, but the backfill made session_groups.id == group_id,
    // so resolving to the legacy id finds the record.
    refRow = null;
    lessonRefRow = null;
    sessionGroupRow = { id: GROUP };
    legacyRows = [];

    expect(await hasGroupAccess(fakeSupabase(), GROUP, USER)).toBe(true);
  });

  it('falls back to legacy live membership when no durable record is visible', async () => {
    // No group_ref yet (un-backfilled) and the session_groups read returns
    // nothing, but the caller still has a live session in the group.
    refRow = null;
    sessionGroupRow = null;
    legacyRows = [{ id: 'session-1' }];

    expect(await hasGroupAccess(fakeSupabase(), GROUP, USER)).toBe(true);
  });

  it('denies when neither the group record nor legacy membership is visible', async () => {
    refRow = null;
    sessionGroupRow = null;
    legacyRows = [];

    expect(await hasGroupAccess(fakeSupabase(), GROUP, USER)).toBe(false);
  });
});
