/**
 * Unit tests for the session-instance top-up riding along with the daily
 * cleanup-uploads cron (SPE-291). The cleanup cron is the production trigger
 * (Vercel Hobby's two cron slots are both taken), so its contract matters:
 * top-up runs after cleanup, its counts are reported, and a top-up failure
 * fails the whole run loud (5xx).
 */
import { NextRequest } from 'next/server';

const mockRpc = jest.fn();
const mockLt = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc: mockRpc,
    from: () => ({ delete: () => ({ lt: mockLt }) }),
  }),
}));

import { GET } from '@/app/api/cron/cleanup-uploads/route';

const makeRequest = () =>
  new NextRequest('http://localhost/api/cron/cleanup-uploads', {
    method: 'GET',
    headers: { 'x-cron-secret': 'test-secret' },
  });

describe('/api/cron/cleanup-uploads session top-up integration', () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalAnalytics = process.env.CLEANUP_ANALYTICS;

  beforeEach(() => {
    mockRpc.mockReset();
    mockLt.mockReset();
    mockLt.mockResolvedValue({ error: null, count: 3 });
    process.env.CRON_SECRET = 'test-secret';
    delete process.env.CLEANUP_ANALYTICS;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalAnalytics === undefined) delete process.env.CLEANUP_ANALYTICS;
    else process.env.CLEANUP_ANALYTICS = originalAnalytics;
  });

  it('runs the top-up after cleanup and reports its counts', async () => {
    mockRpc.mockResolvedValue({
      data: [{ templates_processed: 371, instances_created: 4200 }],
      error: null,
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('topup_session_instances', {
      p_weeks_ahead: 12,
    });
    expect(body).toMatchObject({
      success: true,
      deleted: 3,
      sessionTopup: {
        templatesProcessed: 371,
        instancesCreated: 4200,
        weeksAhead: 12,
      },
    });
  });

  it('fails the run loud (5xx) when the top-up errors, preserving the cleanup count', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('session top-up');
    // The cleanup already ran; its count must survive in the failure body.
    expect(body.deleted).toBe(3);
  });

  it('500s via the outer catch when the top-up rejects (rpc throws)', async () => {
    mockRpc.mockRejectedValue(new Error('network down'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});
