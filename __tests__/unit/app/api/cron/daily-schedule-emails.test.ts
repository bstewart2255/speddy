/**
 * SPE-320 · /api/cron/daily-schedule-emails.
 *
 * Contract: CRON_SECRET-authenticated (x-cron-secret or Bearer, same as the
 * other crons); emails ONLY opted-in profiles; skips zero-session recipients;
 * stamps a per-recipient idempotency key so a cron retry can't double-send; and
 * one recipient's failure never stops the run.
 */
import { NextRequest } from 'next/server';

// --- Mock the service client (recipient + student reads) ---
const eqCalls: Array<[string, unknown]> = [];
let recipientsResult: { data: any[]; error: any } = { data: [], error: null };
let studentsResult: { data: any[]; error: any } = { data: [], error: null };

function makeQuery(resolve: () => any) {
  const q: any = {
    select: jest.fn(() => q),
    eq: jest.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return q;
    }),
    in: jest.fn(() => Promise.resolve(resolve())),
  };
  return q;
}

const mockFrom = jest.fn((table: string) => {
  if (table === 'students') return makeQuery(() => studentsResult);
  return makeQuery(() => recipientsResult); // profiles
});

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

// --- Mock SessionGenerator ---
const mockGetSessions = jest.fn();
jest.mock('@/lib/services/session-generator', () => ({
  SessionGenerator: jest.fn().mockImplementation(() => ({
    getSessionsForDateRange: mockGetSessions,
  })),
}));

// --- Mock Resend ---
const mockSend = jest.fn();
jest.mock('@/lib/email/resend', () => ({
  getResend: () => ({ emails: { send: mockSend } }),
}));

// --- Mock Sentry ---
const mockCapture = jest.fn();
jest.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => mockCapture(...a) }));

import { GET, POST } from '@/app/api/cron/daily-schedule-emails/route';

const makeRequest = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/cron/daily-schedule-emails', { method: 'GET', headers });

const aSession = (over: Record<string, any> = {}) => ({
  student_id: 's1',
  start_time: '08:30:00',
  end_time: '09:00:00',
  service_type: 'resource',
  group_id: null,
  assigned_to_sea_id: null,
  ...over,
});

describe('/api/cron/daily-schedule-emails', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    eqCalls.length = 0;
    recipientsResult = { data: [], error: null };
    studentsResult = { data: [{ id: 's1', initials: 'J.M.', school_site: 'Lincoln' }], error: null };
    mockFrom.mockClear();
    mockGetSessions.mockReset().mockResolvedValue([aSession()]);
    mockSend.mockReset().mockResolvedValue({ data: { id: 'email_1' }, error: null });
    mockCapture.mockReset();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('500s when CRON_SECRET is not configured, without sending', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest({ 'x-cron-secret': 'anything' }));
    expect(res.status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('401s without / with the wrong secret, without sending', async () => {
    const missing = await GET(makeRequest());
    const wrong = await GET(makeRequest({ 'x-cron-secret': 'nope' }));
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('only emails opted-in profiles (filters daily_schedule_email_enabled = true)', async () => {
    recipientsResult = {
      data: [{ id: 'u1', email: 'u1@example.com', role: 'resource', works_at_multiple_schools: false }],
      error: null,
    };
    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(['daily_schedule_email_enabled', true]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ success: true, sent: 1, skipped: 0, failed: 0 });
  });

  it('skips zero-session recipients (no email)', async () => {
    recipientsResult = {
      data: [{ id: 'u1', email: 'u1@example.com', role: 'resource', works_at_multiple_schools: false }],
      error: null,
    };
    mockGetSessions.mockResolvedValue([]); // no sessions today
    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
    expect(body).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
  });

  it('stamps the per-recipient idempotency key daily-schedule-{userId}-{yyyy-MM-dd}', async () => {
    recipientsResult = {
      data: [{ id: 'user-42', email: 'u@example.com', role: 'resource', works_at_multiple_schools: false }],
      error: null,
    };
    await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, options] = mockSend.mock.calls[0];
    expect(options.idempotencyKey).toMatch(/^daily-schedule-user-42-\d{4}-\d{2}-\d{2}$/);
  });

  it('continues after a per-recipient failure (partial failure is isolated)', async () => {
    recipientsResult = {
      data: [
        { id: 'u1', email: 'u1@example.com', role: 'resource', works_at_multiple_schools: false },
        { id: 'u2', email: 'u2@example.com', role: 'resource', works_at_multiple_schools: false },
      ],
      error: null,
    };
    mockSend
      .mockRejectedValueOnce(new Error('resend down'))
      .mockResolvedValueOnce({ data: { id: 'email_2' }, error: null });

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({ sent: 1, failed: 1 });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('POST delegates to the same handler', async () => {
    recipientsResult = {
      data: [{ id: 'u1', email: 'u1@example.com', role: 'resource', works_at_multiple_schools: false }],
      error: null,
    };
    const res = await POST(makeRequest({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
