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
/** When true the students query never settles, simulating a hung lookup. */
let studentsQueryHangs = false;

function makeQuery(resolve: () => any, hangs = false) {
  const q: any = {
    select: jest.fn(() => q),
    eq: jest.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return q;
    }),
    in: jest.fn(() => (hangs ? new Promise(() => {}) : Promise.resolve(resolve()))),
  };
  return q;
}

const mockFrom = jest.fn((table: string) => {
  if (table === 'students') return makeQuery(() => studentsResult, studentsQueryHangs);
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
  provider_id: null,
  start_time: '08:30:00',
  end_time: '09:00:00',
  service_type: 'resource',
  group_id: null,
  assigned_to_sea_id: null,
  assigned_to_specialist_id: null,
  ...over,
});

describe('/api/cron/daily-schedule-emails', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    // Sends are paced to Resend's 2/s quota in production. Left on, the
    // multi-recipient cases below would sit in real timers for seconds; the
    // pacing itself is covered by its own test, which drives fake timers.
    process.env.RESEND_SEND_INTERVAL_MS = '0';
    eqCalls.length = 0;
    studentsQueryHangs = false;
    recipientsResult = { data: [], error: null };
    studentsResult = { data: [{ id: 's1', initials: 'J.M.', school_site: 'Lincoln' }], error: null };
    mockFrom.mockClear();
    // Realistic default: getSessionsForDateRange returns the queried user's own
    // (not-delegated-out) sessions.
    mockGetSessions.mockReset().mockImplementation((userId: string) =>
      Promise.resolve([aSession({ provider_id: userId })])
    );
    mockSend.mockReset().mockResolvedValue({ data: { id: 'email_1' }, error: null });
    mockCapture.mockReset();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    delete process.env.RESEND_SEND_INTERVAL_MS;
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

  it('counts a Resend API-level error ({ error }, no throw) as failed, not sent', async () => {
    recipientsResult = {
      data: [{ id: 'u1', email: 'u1@example.com', role: 'resource', works_at_multiple_schools: false }],
      error: null,
    };
    // Resend v4 resolves with { error } instead of throwing on API failures.
    // Deliberately NOT a rate-limit error: those are retried now and have their
    // own tests below. This pins the permanent-failure path.
    mockSend.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Invalid `to` field' } });

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ sent: 0, failed: 1 });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('excludes a provider’s delegated-out sessions (skips when only delegated)', async () => {
    recipientsResult = {
      data: [{ id: 'prov-1', email: 'p@example.com', role: 'resource', works_at_multiple_schools: false }],
      error: null,
    };
    // Provider owns the session but delegated it to a SEA → not their "my session".
    mockGetSessions.mockResolvedValue([
      aSession({ provider_id: 'prov-1', assigned_to_sea_id: 'sea-9' }),
    ]);

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
    expect(body).toMatchObject({ sent: 0, skipped: 1 });
  });

  it('emails an SEA the sessions assigned to them (owned by another provider)', async () => {
    recipientsResult = {
      data: [{ id: 'sea-9', email: 'sea@example.com', role: 'sea', works_at_multiple_schools: false }],
      error: null,
    };
    mockGetSessions.mockResolvedValue([
      aSession({ provider_id: 'prov-1', assigned_to_sea_id: 'sea-9' }),
    ]);

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ sent: 1, skipped: 0 });
  });

  it('scopes an SEA to only their own assigned sessions', async () => {
    recipientsResult = {
      data: [{ id: 'sea-1', email: 'sea@example.com', role: 'sea', works_at_multiple_schools: false }],
      error: null,
    };
    // Distinct fixtures so a leaked s2 would render its own initials (not "?"),
    // making the negative assertion below actually prove exclusion.
    studentsResult = {
      data: [
        { id: 's1', initials: 'J.M.', school_site: 'Lincoln' },
        { id: 's2', initials: 'Z.Z.', school_site: 'Lincoln' },
      ],
      error: null,
    };
    // getSessionsForDateRange can surface another SEA's assigned row; the cron's
    // my-sessions filter must keep only sessions assigned to THIS recipient.
    mockGetSessions.mockResolvedValue([
      aSession({ student_id: 's1', start_time: '08:30:00', provider_id: 'prov-1', assigned_to_sea_id: 'sea-1' }),
      aSession({ student_id: 's2', start_time: '09:30:00', provider_id: 'prov-1', assigned_to_sea_id: 'someone-else' }),
    ]);

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ sent: 1, skipped: 0 });
    // Only the assigned student appears; the other SEA's session is excluded.
    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain('J.M.');
    expect(payload.html).not.toContain('Z.Z.');
    expect(payload.text).not.toContain('Z.Z.');
  });

  // --- SPE-329 scale hardening ---------------------------------------------
  // v1 was strictly serial with a students query per recipient. These pin the
  // properties that replaced it; none of them change what any user receives.

  const manyRecipients = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      role: 'resource',
      works_at_multiple_schools: false,
    }));

  const studentQueryCount = () =>
    mockFrom.mock.calls.filter(([table]) => table === 'students').length;

  it('looks students up once for the whole run, not once per recipient (N+1)', async () => {
    // 12 recipients also exceeds the concurrency limit, so this doubles as
    // proof that chunking still gets through every recipient.
    recipientsResult = { data: manyRecipients(12), error: null };

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ sent: 12, skipped: 0, failed: 0 });
    expect(mockSend).toHaveBeenCalledTimes(12);
    expect(studentQueryCount()).toBe(1); // was 12
  });

  it('does not query students at all when nobody has sessions', async () => {
    recipientsResult = { data: manyRecipients(3), error: null };
    mockGetSessions.mockResolvedValue([]);

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));

    expect(res.status).toBe(200);
    expect(studentQueryCount()).toBe(0);
  });

  it('chunks the student id list so one big run cannot blow the URL length', async () => {
    // Collapsing N queries into one only helps if the one query stays sendable.
    // 250 distinct ids must split into 200 + 50, not a single 250-id filter.
    recipientsResult = { data: manyRecipients(1), error: null };
    mockGetSessions.mockResolvedValue(
      Array.from({ length: 250 }, (_, i) => aSession({ student_id: `s${i}`, provider_id: 'u0' }))
    );

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));

    expect(res.status).toBe(200);
    expect(studentQueryCount()).toBe(2);
  });

  it('still sends when the students lookup fails, rather than dropping the run', async () => {
    recipientsResult = { data: manyRecipients(1), error: null };
    studentsResult = { data: null, error: { message: 'db unavailable' } };

    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ sent: 1, failed: 0 });
    // Unresolvable students degrade to the "?" placeholder — no initials leak
    // through and, more to the point, the email still goes out.
    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain('J.M.');
  });

  it('gives up on a hung recipient instead of stalling everyone behind it', async () => {
    jest.useFakeTimers();
    try {
      recipientsResult = { data: manyRecipients(2), error: null };
      // u0's session generation never settles. Without the per-call timeout it
      // holds its slot until the function is killed, and u1 gets no email.
      mockGetSessions.mockImplementation((userId: string) =>
        userId === 'u0'
          ? new Promise(() => {})
          : Promise.resolve([aSession({ provider_id: userId })])
      );

      const pending = GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
      await jest.advanceTimersByTimeAsync(25_000); // past PER_RECIPIENT_TIMEOUT_MS
      const res = await pending;
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ sent: 1, failed: 1 });
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(String(mockCapture.mock.calls[0][0])).toMatch(/timed out/i);
    } finally {
      jest.useRealTimers();
    }
  });

  // --- Review findings on this PR ------------------------------------------
  // Both are failures the concurrency work itself introduced.

  it('paces sends to the quota instead of bursting a whole chunk (Codex)', async () => {
    // Resend's default is 2 requests/second. Firing a chunk of 5 at once turns
    // the surplus into 429s, and a 429 counted as permanent means those people
    // silently get no schedule — the exact outcome this feature exists to avoid.
    delete process.env.RESEND_SEND_INTERVAL_MS; // production pacing
    jest.useFakeTimers();
    try {
      recipientsResult = { data: manyRecipients(5), error: null };

      const pending = GET(makeRequest({ 'x-cron-secret': 'test-secret' }));

      await jest.advanceTimersByTimeAsync(0);
      expect(mockSend).toHaveBeenCalledTimes(1); // not 5

      await jest.advanceTimersByTimeAsync(600);
      expect(mockSend).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(10_000);
      const body = await (await pending).json();

      expect(mockSend).toHaveBeenCalledTimes(5);
      expect(body).toMatchObject({ sent: 5, failed: 0 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries a throttled send rather than dropping that recipient (Codex)', async () => {
    jest.useFakeTimers();
    try {
      recipientsResult = { data: manyRecipients(1), error: null };
      mockSend
        .mockResolvedValueOnce({
          data: null,
          error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
        })
        .mockResolvedValueOnce({ data: { id: 'email_1' }, error: null });

      const pending = GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
      await jest.advanceTimersByTimeAsync(10_000);
      const body = await (await pending).json();

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(body).toMatchObject({ sent: 1, failed: 0, throttled: 1 });
      expect(mockCapture).not.toHaveBeenCalled();

      // Stable key across attempts — a retry after a 429 that actually landed
      // is de-duped by Resend rather than delivered twice.
      expect(mockSend.mock.calls[1][1].idempotencyKey).toBe(
        mockSend.mock.calls[0][1].idempotencyKey
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('still gives up on a persistently throttled send, so it cannot loop', async () => {
    jest.useFakeTimers();
    try {
      recipientsResult = { data: manyRecipients(1), error: null };
      mockSend.mockResolvedValue({
        data: null,
        error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
      });

      const pending = GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
      await jest.advanceTimersByTimeAsync(60_000);
      const body = await (await pending).json();

      expect(mockSend).toHaveBeenCalledTimes(3); // the attempt cap
      expect(body).toMatchObject({ sent: 0, failed: 1 });
      expect(mockCapture).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('times out a hung students lookup instead of stranding the run (CodeRabbit)', async () => {
    // This query sits BETWEEN the phases, so unlike a per-recipient hang it
    // strands everyone: phase 3 never starts and nobody gets an email.
    jest.useFakeTimers();
    try {
      recipientsResult = { data: manyRecipients(2), error: null };
      studentsQueryHangs = true;

      const pending = GET(makeRequest({ 'x-cron-secret': 'test-secret' }));
      await jest.advanceTimersByTimeAsync(25_000); // past the lookup timeout
      const body = await (await pending).json();

      // The run completes and both recipients are still emailed, with initials
      // degraded to the "?" placeholder.
      expect(body).toMatchObject({ sent: 2, failed: 0 });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(String(mockCapture.mock.calls[0][0])).toMatch(/timed out/i);
    } finally {
      jest.useRealTimers();
    }
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
