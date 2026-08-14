/**
 * SPE-505: shared request-body ceilings for the upload routes.
 *
 * Generalises the import-only guard from SPE-443. The failure being guarded
 * against is that `formData()`/`json()` buffer the entire body into memory
 * before any handler code runs, so a per-file size check afterwards is too late
 * — and a Content-Length check can't substitute, since omitting, chunking, or
 * understating the header skips it.
 *
 * Real Request objects with real ReadableStream bodies are used throughout, so
 * these exercise the byte counting rather than a mocked header lookup. The
 * mechanism tests use a small limit so they stay fast; the last block pins the
 * production ceilings against the limits each route already enforces.
 */
import {
  readCappedFormData,
  readCappedJson,
  declaresOversizedBody,
  BodyTooLargeError,
  BODY_LIMITS,
} from '@/lib/api/body-limit';

const URL_UNDER_TEST = 'http://localhost/api/upload';
const CHUNK = 1024;
const LIMIT = 8 * CHUNK;

/**
 * A body that never ends, delivered in 1 KB chunks.
 *
 * The safety limit exists so a regression fails the test quickly rather than
 * buffering an endless stream until the process dies.
 */
function unboundedBody(safetyLimitChunks: number) {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls > safetyLimitChunks) {
        controller.error(new Error(`read was never capped (${pulls} chunks pulled)`));
        return;
      }
      controller.enqueue(new Uint8Array(CHUNK));
    },
  });
  return { stream, pulled: () => pulls };
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function streamingRequest(body: ReadableStream<Uint8Array>, headers: Record<string, string>) {
  // undici requires `duplex: 'half'` for a streaming request body.
  return new Request(URL_UNDER_TEST, {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

const BOUNDARY = '----speddyBodyLimitTest';

/**
 * Hand-rolled multipart bytes. Deliberately not `new FormData()`: under jsdom
 * the FormData/File globals are jsdom's while Request is Node's undici, and
 * handing one to the other misbehaves.
 */
function multipart(fileBody: string): { bytes: Uint8Array; contentType: string } {
  const parts = [
    `--${BOUNDARY}\r\n`,
    'Content-Disposition: form-data; name="file"; filename="doc.txt"\r\n',
    'Content-Type: text/plain\r\n\r\n',
    `${fileBody}\r\n`,
    `--${BOUNDARY}\r\n`,
    'Content-Disposition: form-data; name="title"\r\n\r\n',
    'A title\r\n',
    `--${BOUNDARY}--\r\n`,
  ].join('');
  return {
    bytes: new TextEncoder().encode(parts),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

describe('declaresOversizedBody (Content-Length fast path)', () => {
  const withContentLength = (value: string | null) =>
    ({
      headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? value : null) },
    }) as unknown as Request;

  it('rejects an honestly-declared oversized body', () => {
    expect(declaresOversizedBody(withContentLength(String(LIMIT + 1)), LIMIT)).toBe(true);
  });

  it('passes a within-limit body through', () => {
    expect(declaresOversizedBody(withContentLength(String(LIMIT - 1)), LIMIT)).toBe(false);
  });

  // Both of these are why the fast path cannot be the enforcement point — it
  // has nothing to judge, so it must defer to the capped read.
  it('cannot judge a missing Content-Length', () => {
    expect(declaresOversizedBody(withContentLength(null), LIMIT)).toBe(false);
  });

  it('cannot judge an unparseable Content-Length', () => {
    expect(declaresOversizedBody(withContentLength('banana'), LIMIT)).toBe(false);
  });
});

describe('readCappedJson', () => {
  const SAFETY_LIMIT_CHUNKS = 64;
  const MAX_EXPECTED_CHUNKS = LIMIT / CHUNK + 2;

  it('caps an unbounded body that omits Content-Length', async () => {
    const { stream, pulled } = unboundedBody(SAFETY_LIMIT_CHUNKS);
    const request = streamingRequest(stream, { 'content-type': 'application/json' });

    await expect(readCappedJson(request, LIMIT)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pulled()).toBeLessThanOrEqual(MAX_EXPECTED_CHUNKS);
  });

  it('caps an unbounded body that understates Content-Length', async () => {
    const { stream, pulled } = unboundedBody(SAFETY_LIMIT_CHUNKS);
    const request = streamingRequest(stream, {
      'content-type': 'application/json',
      // A deliberate lie the fast path would wave through.
      'content-length': '12',
    });

    await expect(readCappedJson(request, LIMIT)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pulled()).toBeLessThanOrEqual(MAX_EXPECTED_CHUNKS);
  });

  it('parses a within-limit body sent without Content-Length', async () => {
    const payload = { image: 'data:image/png;base64,AAAA', source: 'qr_scan_upload' };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const request = streamingRequest(streamOf(bytes), { 'content-type': 'application/json' });

    await expect(readCappedJson(request, LIMIT)).resolves.toEqual(payload);
  });

  it('propagates a genuine parse error rather than reporting it as too large', async () => {
    // A malformed body under the ceiling must not be misreported as a 413.
    const bytes = new TextEncoder().encode('{ not json');
    const request = streamingRequest(streamOf(bytes), { 'content-type': 'application/json' });

    await expect(readCappedJson(request, LIMIT)).rejects.not.toBeInstanceOf(BodyTooLargeError);
  });
});

describe('readCappedFormData', () => {
  const SAFETY_LIMIT_CHUNKS = 64;
  const MAX_EXPECTED_CHUNKS = LIMIT / CHUNK + 2;

  it('caps an unbounded multipart body', async () => {
    const { stream, pulled } = unboundedBody(SAFETY_LIMIT_CHUNKS);
    const request = streamingRequest(stream, {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    });

    await expect(readCappedFormData(request, LIMIT)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pulled()).toBeLessThanOrEqual(MAX_EXPECTED_CHUNKS);
  });

  it('parses a within-limit upload sent without Content-Length', async () => {
    const { bytes, contentType } = multipart('hello document');
    const request = streamingRequest(streamOf(bytes), { 'content-type': contentType });

    const form = await readCappedFormData(request, LIMIT);

    expect((form.get('file') as File).name).toBe('doc.txt');
    expect(await (form.get('file') as File).text()).toBe('hello document');
    expect(form.get('title')).toBe('A title');
  });

  it('reads directly when the request exposes no body stream', async () => {
    // Nothing to buffer means nothing to cap.
    const stub = {
      url: URL_UNDER_TEST,
      method: 'POST',
      formData: async () => ({ get: (k: string) => (k === 'title' ? 'direct' : null) }),
    } as unknown as Request;

    const form = await readCappedFormData(stub, LIMIT);
    expect(form.get('title')).toBe('direct');
  });
});

/**
 * The ceilings are memory backstops, not product limits. Each route already
 * enforces (or is expected to enforce) its own per-file rule, and the ceiling
 * has to sit ABOVE that — otherwise capping would start rejecting uploads that
 * work today, which is exactly what this change must not do.
 */
describe('BODY_LIMITS stay looser than the per-file rules they sit behind', () => {
  const TEN_MB = 10 * 1024 * 1024;

  it('clears a 10 MB image carried as base64 JSON on submit-worksheet', () => {
    // base64 inflates by ~4/3, and the JSON wrapper adds more on top.
    expect(BODY_LIMITS.submitWorksheet).toBeGreaterThan(Math.ceil((TEN_MB * 4) / 3));
  });

  it('clears the 10 MB file rule on saved worksheets', () => {
    expect(BODY_LIMITS.savedWorksheet).toBeGreaterThan(TEN_MB);
  });

  it('clears the 10 MB-per-file import convention on the goals import', () => {
    expect(BODY_LIMITS.iepGoalsImport).toBeGreaterThan(TEN_MB);
  });

  it('leaves documents room well past a large scan', () => {
    expect(BODY_LIMITS.document).toBeGreaterThanOrEqual(50 * 1024 * 1024);
  });
});
