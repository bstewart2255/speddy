/**
 * Unit tests for /api/cron/topup-session-instances (SPE-291).
 *
 * Contract: header-authenticated by CRON_SECRET (x-cron-secret or Bearer),
 * fails loud (5xx) on misconfiguration or DB error, and on success invokes the
 * topup_session_instances RPC with the 12-week rolling horizon and reports its
 * counts.
 */
import { NextRequest } from 'next/server';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: mockRpc }),
}));

import { GET, POST } from '@/app/api/cron/topup-session-instances/route';

const makeRequest = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/cron/topup-session-instances', {
    method: 'GET',
    headers,
  });

describe('/api/cron/topup-session-instances', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mockRpc.mockReset();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('500s when CRON_SECRET is not configured, without touching the DB', async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(makeRequest({ 'x-cron-secret': 'anything' }));

    expect(res.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('401s without a valid secret, without touching the DB', async () => {
    const missing = await GET(makeRequest());
    const wrong = await GET(makeRequest({ 'x-cron-secret': 'nope' }));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('runs the top-up RPC with the 12-week horizon and reports counts', async () => {
    mockRpc.mockResolvedValue({
      data: [{ templates_processed: 371, instances_created: 4200 }],
      error: null,
    });

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('topup_session_instances', {
      p_weeks_ahead: 12,
    });
    expect(body).toMatchObject({
      success: true,
      templatesProcessed: 371,
      instancesCreated: 4200,
      weeksAhead: 12,
    });
  });

  it('accepts the Authorization: Bearer form (Vercel Cron)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ templates_processed: 0, instances_created: 0 }],
      error: null,
    });

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('500s (fails loud) when the RPC errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('POST delegates to the same handler', async () => {
    mockRpc.mockResolvedValue({
      data: [{ templates_processed: 1, instances_created: 12 }],
      error: null,
    });

    const res = await POST(makeRequest({ 'x-cron-secret': 'test-secret' }));

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
