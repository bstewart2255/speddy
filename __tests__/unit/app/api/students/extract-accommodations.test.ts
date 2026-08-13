/**
 * POST /api/students/[studentId]/extract-accommodations (SPE-489) — propose
 * accommodations from an uploaded IEP PDF, extract-and-discard.
 *
 * What these tests pin, in order of how much they matter:
 *   - the route does not exist while the AI kill switch is off (404, no
 *     provider call) — same contract as every other AI route;
 *   - a student the caller's session cannot read is refused (404) before any
 *     provider call, so the route can't be used to run extractions against
 *     other people's students;
 *   - non-PDF and oversized uploads are refused (400) before any provider call;
 *   - the happy path returns the model's list sanitized (trimmed, de-duplicated,
 *     non-strings dropped) and sends the PDF as a base64 document block with a
 *     forced tool choice — the structured-output contract;
 *   - a provider-side rejection (bad PDF), a safety refusal, and a malformed
 *     model response each map to a friendly error without leaking provider
 *     error text.
 */
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';

const mockCreate = jest.fn();
const mockClientOptions = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  class MockAPIError extends Error {
    status?: number;
    constructor(status?: number, message = 'provider internal detail') {
      super(message);
      this.status = status;
    }
  }
  class MockBadRequestError extends MockAPIError {
    constructor() {
      super(400, 'provider bad request detail');
    }
  }
  class MockRateLimitError extends MockAPIError {
    constructor() {
      super(429, 'provider rate limit detail');
    }
  }
  class MockAnthropic {
    static APIError = MockAPIError;
    static BadRequestError = MockBadRequestError;
    static RateLimitError = MockRateLimitError;
    messages = { create: (...args: unknown[]) => mockCreate(...args) };
    constructor(opts: unknown) {
      mockClientOptions(opts);
    }
  }
  return { __esModule: true, default: MockAnthropic };
});

let studentResult: { data: unknown; error: unknown } = {
  data: { id: STUDENT_ID },
  error: null,
};

// The ownership query chains .eq('id', …).eq('provider_id', …), so the mock
// query object returns itself from eq.
const mockEqFilters = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const query: any = {
      select: () => query,
      eq: (column: string, value: string) => {
        mockEqFilters(column, value);
        return query;
      },
      maybeSingle: async () => studentResult,
    };
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      },
      from: () => query,
    };
  },
}));

jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: async () => ({ allowed: true, remaining: 10, resetSeconds: 3600 }),
}));

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { POST } from '@/app/api/students/[studentId]/extract-accommodations/route';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 fake iep document');

// jsdom's FormData/File don't serialize through undici's Request body, so the
// multipart payload is built by hand — same wire format the browser sends.
const BOUNDARY = '----jest-test-boundary';

const multipartBody = (fileBytes?: Uint8Array, name = 'iep.pdf') => {
  const encoder = new TextEncoder();
  if (!fileBytes) return encoder.encode(`--${BOUNDARY}--\r\n`);
  const head = encoder.encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${BOUNDARY}--\r\n`);
  const body = new Uint8Array(head.length + fileBytes.length + tail.length);
  body.set(head, 0);
  body.set(fileBytes, head.length);
  body.set(tail, head.length + fileBytes.length);
  return body;
};

const makeRequest = (fileBytes?: Uint8Array | string, studentId = STUDENT_ID) => {
  const bytes =
    typeof fileBytes === 'string' ? new TextEncoder().encode(fileBytes) : fileBytes;
  return new NextRequest(
    `http://localhost/api/students/${studentId}/extract-accommodations`,
    {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      body: multipartBody(bytes),
    }
  );
};

const ctx = (studentId = STUDENT_ID) => ({ params: Promise.resolve({ studentId }) });

const toolResponse = (accommodations: unknown) => ({
  stop_reason: 'tool_use',
  content: [
    {
      type: 'tool_use',
      id: 'tu_1',
      name: 'record_accommodations',
      input: { accommodations },
    },
  ],
  usage: { input_tokens: 5000, output_tokens: 100 },
});

const ENV_KEYS = ['AI_FEATURES_ENABLED', 'ANTHROPIC_API_KEY'] as const;
const originalEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AI_FEATURES_ENABLED = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  studentResult = { data: { id: STUDENT_ID }, error: null };
});

describe('POST /api/students/[studentId]/extract-accommodations', () => {
  it('404s while the AI kill switch is off, without calling Anthropic', async () => {
    delete process.env.AI_FEATURES_ENABLED;
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects a malformed student id before touching the database', async () => {
    const res = await POST(makeRequest(PDF_BYTES, 'not-a-uuid'), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404s for a student the caller does not own, without calling Anthropic', async () => {
    studentResult = { data: null, error: null };
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found or access denied/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('scopes the ownership check to the signed-in provider, not just the student id', async () => {
    mockCreate.mockResolvedValueOnce(toolResponse([]));
    await POST(makeRequest(PDF_BYTES), ctx());
    expect(mockEqFilters).toHaveBeenCalledWith('id', STUDENT_ID);
    expect(mockEqFilters).toHaveBeenCalledWith('provider_id', USER_ID);
  });

  it('rejects a request with no file', async () => {
    const res = await POST(makeRequest(undefined), ctx());
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects a file that is not a PDF (magic bytes, not extension)', async () => {
    const res = await POST(makeRequest('just some text'), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not a pdf/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects a PDF over the 4MB limit', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode('%PDF-'), 0);
    const res = await POST(makeRequest(big), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns the sanitized list and sends the PDF with a forced tool choice', async () => {
    mockCreate.mockResolvedValueOnce(
      toolResponse([
        '  Extended time (1.5x) on assessments  ',
        'Preferential seating',
        'preferential   seating', // duplicate after normalization
        42, // non-string dropped
        '   ', // empty after trim dropped
      ])
    );

    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accommodations).toEqual([
      'Extended time (1.5x) on assessments',
      'Preferential seating',
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const request = mockCreate.mock.calls[0][0];
    expect(request.model).toBe('claude-opus-5');
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'record_accommodations' });
    const [documentBlock, textBlock] = request.messages[0].content;
    expect(documentBlock.type).toBe('document');
    expect(documentBlock.source.media_type).toBe('application/pdf');
    expect(documentBlock.source.data).toBe(Buffer.from(PDF_BYTES).toString('base64'));
    expect(textBlock.type).toBe('text');

    // One bounded attempt: the SDK's default 10-minute timeout and 2 retries
    // would outlive the route's 60-second maxDuration.
    expect(mockClientOptions).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 55_000, maxRetries: 0 })
    );
  });

  it('returns an empty list when the document has no accommodations', async () => {
    mockCreate.mockResolvedValueOnce(toolResponse([]));
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accommodations).toEqual([]);
  });

  it('maps a provider rejection (unreadable PDF) to a friendly 422 without leaking provider text', async () => {
    mockCreate.mockRejectedValueOnce(new (Anthropic as any).BadRequestError());
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/couldn't be read/i);
    expect(body.error).not.toMatch(/provider/);
  });

  it('maps a provider rate limit to a friendly 429 without leaking provider text', async () => {
    mockCreate.mockRejectedValueOnce(new (Anthropic as any).RateLimitError());
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/busy right now/i);
    expect(body.error).not.toMatch(/provider/);
  });

  it('maps a safety refusal to a friendly 422', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 100, output_tokens: 0 },
    });
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/couldn't be processed/i);
  });

  it('refuses a truncated (max_tokens) response instead of returning a partial list', async () => {
    mockCreate.mockResolvedValueOnce({
      ...toolResponse(['Extended time']),
      stop_reason: 'max_tokens',
    });
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/couldn't be processed reliably/i);
  });

  it('treats a malformed tool payload as an error, not an empty list', async () => {
    // Missing property
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'record_accommodations', input: {} }],
      usage: { input_tokens: 5000, output_tokens: 10 },
    });
    let res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(502);

    // Wrong type
    mockCreate.mockResolvedValueOnce(toolResponse('extended time'));
    res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(502);
  });

  it('maps a response with no tool output to a friendly 502', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'I looked at the document.' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const res = await POST(makeRequest(PDF_BYTES), ctx());
    expect(res.status).toBe(502);
  });
});
