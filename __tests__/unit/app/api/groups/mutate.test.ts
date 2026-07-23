/**
 * Groups v2 · Phase 2 (SPE-311) — the /api/groups/mutate dispatch layer.
 *
 * The route is deliberately thin: it validates the action shape and forwards to
 * the transactional SECURITY DEFINER RPC (the RPC owns authorization, future-only
 * propagation, and dual-write). These tests pin the dispatch contract — each
 * action maps to the right RPC with the right params — plus validation, the
 * auth gate, and how an RPC guard error surfaces to the client.
 */
import { NextRequest } from 'next/server';

const PROVIDER = 'prov-1';
const mockGetUser = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { POST } from '@/app/api/groups/mutate/route';

const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const S1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const S2 = 'bbbbbbbb-2222-4222-8222-222222222222';
const S3 = 'cccccccc-3333-4333-8333-333333333333';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/groups/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/groups/mutate (SPE-311)', () => {
  beforeEach(() => {
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: PROVIDER } }, error: null });
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it('form → groups_v2_form(p_session_ids) and returns the new group id', async () => {
    mockRpc.mockResolvedValue({ data: G1, error: null });
    const res = await POST(req({ action: 'form', sessionIds: [S1, S2] }));
    expect(mockRpc).toHaveBeenCalledWith('groups_v2_form', { p_session_ids: [S1, S2] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, groupId: G1 });
  });

  it('join / leave / split / merge map to the right RPC and params', async () => {
    await POST(req({ action: 'join', sessionId: S1, groupId: G1 }));
    expect(mockRpc).toHaveBeenLastCalledWith('groups_v2_join', { p_session_id: S1, p_group_id: G1 });

    await POST(req({ action: 'leave', sessionId: S1 }));
    expect(mockRpc).toHaveBeenLastCalledWith('groups_v2_leave', { p_session_id: S1 });

    await POST(req({ action: 'split', groupId: G1, sessionIds: [S3] }));
    expect(mockRpc).toHaveBeenLastCalledWith('groups_v2_split', { p_group_id: G1, p_session_ids: [S3] });

    await POST(req({ action: 'merge', fromGroupId: G1, intoGroupId: G2 }));
    expect(mockRpc).toHaveBeenLastCalledWith('groups_v2_merge', {
      p_from_group_id: G1,
      p_into_group_id: G2,
    });

    await POST(req({ action: 'rename', groupId: G1, name: 'Blue Jays', color: 2 }));
    expect(mockRpc).toHaveBeenLastCalledWith('groups_v2_rename', {
      p_group_id: G1,
      p_name: 'Blue Jays',
      p_color: 2,
    });
  });

  it('leave returns a null groupId on success (void RPC)', async () => {
    const res = await POST(req({ action: 'leave', sessionId: S1 }));
    expect(await res.json()).toMatchObject({ success: true, groupId: null });
  });

  it('rejects form with fewer than 2 sessions before touching the RPC', async () => {
    const res = await POST(req({ action: 'form', sessionIds: [S1] }));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an unknown action', async () => {
    const res = await POST(req({ action: 'delete', groupId: G1 }));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces an RPC guard failure as a 400 with its message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'all sessions must be owned by the caller' } });
    const res = await POST(req({ action: 'leave', sessionId: S1 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'all sessions must be owned by the caller' });
  });

  it('401s when unauthenticated (never calls the RPC)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(req({ action: 'leave', sessionId: S1 }));
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
