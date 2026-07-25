/**
 * SPE-329 · /api/email-webhook — Resend failures are no longer silent.
 *
 * The route sends three courtesy replies back to whoever emailed a worksheet in.
 * All three were bare `await getResend().emails.send(...)`, and Resend v4 does
 * NOT throw when the API rejects a send — it resolves with `{ error }`. So an
 * undeliverable reply was indistinguishable from a delivered one, with nothing
 * in the logs to say otherwise.
 *
 * The fix routes every send through a helper that inspects `{ error }` and logs.
 * It deliberately does NOT throw: unlike the daily-schedule cron (where a failed
 * send means that recipient got no schedule and should be counted as failed),
 * these replies describe a worksheet that has already been processed and stored.
 * Aborting on an undeliverable confirmation would turn a cosmetic problem into
 * a lost submission — so the contract pinned here is "logged, not fatal".
 *
 * The endpoint is disabled by default (EMAIL_WEBHOOK_ENABLED) and its inbound
 * flow isn't live, so these cover the reachable no-attachment path rather than
 * standing up jimp/qrcode-reader for the image branch.
 */
const mockSend = jest.fn();
jest.mock('@/lib/email/resend', () => ({
  getResend: () => ({ emails: { send: mockSend } }),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: jest.fn(), storage: { from: jest.fn() } }),
}));

const WORKSHEET_EMAIL = {
  from: 'teacher@example.com',
  subject: 'Worksheet submission',
  text: 'here is the worksheet',
  attachments: [],
};

/**
 * EMAIL_WEBHOOK_ENABLED is read at module load, so the flag has to be set
 * before the route module is evaluated — hence the isolated re-import.
 */
async function loadRoute(enabled: boolean) {
  process.env.EMAIL_WEBHOOK_ENABLED = enabled ? 'true' : 'false';
  let mod: typeof import('@/app/api/email-webhook/route');
  await jest.isolateModulesAsync(async () => {
    mod = await import('@/app/api/email-webhook/route');
  });
  return mod!;
}

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/email-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;

describe('/api/email-webhook', () => {
  const originalFlag = process.env.EMAIL_WEBHOOK_ENABLED;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({ data: { id: 'email_1' }, error: null });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.EMAIL_WEBHOOK_ENABLED;
    else process.env.EMAIL_WEBHOOK_ENABLED = originalFlag;
  });

  it('stays 404 while disabled, without sending anything (SPE-128)', async () => {
    const { POST } = await loadRoute(false);

    const res = await POST(makeRequest(WORKSHEET_EMAIL));

    expect(res.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('logs a Resend API-level rejection instead of treating it as sent', async () => {
    // The bug: `{ error }` without a throw sailed straight through.
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `to` field' },
    });
    const { POST } = await loadRoute(true);

    const res = await POST(makeRequest(WORKSHEET_EMAIL));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Resend rejected'),
      expect.objectContaining({ message: 'Invalid `to` field' })
    );
    // Still the ordinary no-attachment response — the reply failing to send
    // must not change what the caller is told about their submission.
    expect(res.status).toBe(400);
  });

  it('survives a Resend client throw on the same path', async () => {
    mockSend.mockRejectedValue(new Error('network down'));
    const { POST } = await loadRoute(true);

    const res = await POST(makeRequest(WORKSHEET_EMAIL));

    // 400, not the 500 an unhandled throw would produce.
    expect(res.status).toBe(400);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send'),
      expect.any(Error)
    );
  });

  it('ignores an email that is not a worksheet submission', async () => {
    const { POST } = await loadRoute(true);

    const res = await POST(makeRequest({ from: 'a@b.com', subject: 'hello', text: 'hi' }));

    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
