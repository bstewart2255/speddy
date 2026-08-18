/**
 * Unit tests for the session-instance top-up carried by the daily
 * cleanup-uploads cron (SPE-291). The cron is the production trigger
 * (Vercel Hobby's two cron slots are both taken), so its contract matters:
 * the top-up runs, its counts are reported, and a top-up failure fails the
 * whole run loud (5xx). The upload_rate_limits purge this route was named
 * for and the analytics_events sweep were removed with SPE-497.
 */
import { NextRequest } from 'next/server';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc: mockRpc,
  }),
}));

// SPE-545: the nightly link sync rides along; both halves mocked so this
// suite pins the WIRING (worklist → per-district run → counted outcomes)
// without dialing anything.
const mockListDistricts = jest.fn();
const mockRunAutoLinkSync = jest.fn();
jest.mock('@/lib/sis/auto-link-sync', () => ({
  listAutoSyncDistrictIds: (...a: unknown[]) => mockListDistricts(...a),
  runAutoLinkSync: (...a: unknown[]) => mockRunAutoLinkSync(...a),
}));

import { GET } from '@/app/api/cron/cleanup-uploads/route';

const makeRequest = () =>
  new NextRequest('http://localhost/api/cron/cleanup-uploads', {
    method: 'GET',
    headers: { 'x-cron-secret': 'test-secret' },
  });

describe('/api/cron/cleanup-uploads session top-up integration', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mockRpc.mockReset();
    mockListDistricts.mockReset().mockResolvedValue([]);
    mockRunAutoLinkSync.mockReset().mockResolvedValue('nothing-to-do');
    process.env.CRON_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
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

describe('/api/cron/cleanup-uploads nightly link-sync ride-along (SPE-545)', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({
      data: [{ templates_processed: 1, instances_created: 1 }],
      error: null,
    });
    mockListDistricts.mockReset();
    mockRunAutoLinkSync.mockReset();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('an unauthorized caller reaches neither the worklist nor a run', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/cron/cleanup-uploads', {
        method: 'GET',
        headers: { 'x-cron-secret': 'wrong' },
      }),
    );
    expect(res.status).toBe(401);
    expect(mockListDistricts).not.toHaveBeenCalled();
    expect(mockRunAutoLinkSync).not.toHaveBeenCalled();
  });

  it('runs each connected district as a cron-triggered system action and counts outcomes', async () => {
    mockListDistricts.mockResolvedValue(['d-1', 'd-2', 'd-3']);
    mockRunAutoLinkSync
      .mockResolvedValueOnce('applied')
      .mockResolvedValueOnce('nothing-to-do')
      .mockResolvedValueOnce('refused');

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRunAutoLinkSync).toHaveBeenCalledTimes(3);
    expect(mockRunAutoLinkSync).toHaveBeenCalledWith({
      districtId: 'd-1',
      trigger: 'cron',
      actorId: null,
    });
    expect(body.linkSync).toEqual({ applied: 1, 'nothing-to-do': 1, refused: 1 });
  });

  it('a failed worklist read is reported without failing the jobs that ran', async () => {
    mockListDistricts.mockRejectedValue(new Error('relation district_sis_connections denied'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sessionTopup).toBeDefined();
    expect(body.linkSync.error).toBe('Could not list SIS connections');
    // Sanitized: the response never echoes database details.
    expect(JSON.stringify(body)).not.toContain('district_sis_connections');
  });
});
