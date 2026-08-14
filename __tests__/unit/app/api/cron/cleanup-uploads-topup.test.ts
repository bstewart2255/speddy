/**
 * Unit tests for the session-instance top-up carried by the daily
 * cleanup-uploads cron (SPE-291). The cron is the production trigger
 * (Vercel Hobby's two cron slots are both taken), so its contract matters:
 * the top-up runs, its counts are reported, and a top-up failure fails the
 * whole run loud (5xx). The upload_rate_limits purge this route was named
 * for was removed with the QR worksheet-upload feature (SPE-497).
 */
import { NextRequest } from 'next/server';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc: mockRpc,
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
    process.env.CRON_SECRET = 'test-secret';
    delete process.env.CLEANUP_ANALYTICS;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalAnalytics === undefined) delete process.env.CLEANUP_ANALYTICS;
    else process.env.CLEANUP_ANALYTICS = originalAnalytics;
  });

  it('runs the top-up and reports its counts', async () => {
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
      sessionTopup: {
        templatesProcessed: 371,
        instancesCreated: 4200,
        weeksAhead: 12,
      },
    });
  });

  it('fails the run loud (5xx) when the top-up errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('session top-up');
  });

  it('500s via the outer catch when the top-up rejects (rpc throws)', async () => {
    mockRpc.mockRejectedValue(new Error('network down'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});
