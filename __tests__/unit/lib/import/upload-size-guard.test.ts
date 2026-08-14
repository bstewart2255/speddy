/**
 * SPE-443: the import upload-size guard must hold regardless of what the
 * request's headers claim.
 *
 * The original guard (SPE-260) read Content-Length and rejected an over-ceiling
 * body before formData() buffered it. That only works against a client that
 * declares an honest, oversized length. Omitting the header, using chunked
 * transfer-encoding, or simply understating the length skipped the check
 * entirely and handed an unbounded body straight to formData() — precisely the
 * memory-exhaustion case the guard exists to close.
 *
 * These tests drive real Request objects with real ReadableStream bodies, so
 * they exercise the byte counting rather than a mocked header lookup.
 */
import {
  readImportForm,
  exceedsTotalUploadSize,
  UploadTooLargeError,
  MAX_TOTAL_UPLOAD_BYTES,
} from '@/lib/import/parse-files';

const URL_UNDER_TEST = 'http://localhost/api/import-students';
const ONE_MB = 1024 * 1024;

/**
 * A body that never ends, delivered in 1 MB chunks.
 *
 * The guard must abandon the read shortly after MAX_TOTAL_UPLOAD_BYTES. The
 * safety limit exists so a regression fails the test quickly instead of
 * exhausting the CI runner's memory: without a cap, an endless stream would be
 * buffered until the process dies.
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
      controller.enqueue(new Uint8Array(ONE_MB));
    },
  });
  return { stream, pulled: () => pulls };
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

const CSV_BODY = 'Last,First\nDoe,Jane\n';
const BOUNDARY = '----speddyUploadGuardTest';

/**
 * Hand-rolled multipart bytes.
 *
 * Deliberately not built with `new FormData()`: under the jsdom test
 * environment the FormData/File globals are jsdom's, while Request is Node's
 * undici, and handing one to the other misbehaves (the same mismatch noted in
 * import-students-preview.characterization.test.ts). Encoding by hand keeps
 * this test on the one path that matters — undici parsing a real wire body.
 */
function encodeMultipart(): { bytes: Uint8Array; contentType: string } {
  const parts = [
    `--${BOUNDARY}\r\n`,
    'Content-Disposition: form-data; name="studentsFile"; filename="students.csv"\r\n',
    'Content-Type: text/csv\r\n\r\n',
    `${CSV_BODY}\r\n`,
    `--${BOUNDARY}\r\n`,
    'Content-Disposition: form-data; name="currentSchoolId"\r\n\r\n',
    'school-1\r\n',
    `--${BOUNDARY}\r\n`,
    'Content-Disposition: form-data; name="currentSchoolSite"\r\n\r\n',
    'Bancroft Elementary\r\n',
    `--${BOUNDARY}--\r\n`,
  ].join('');

  return {
    bytes: new TextEncoder().encode(parts),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

function bodyFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe('exceedsTotalUploadSize (Content-Length fast path)', () => {
  const withContentLength = (value: string | null) =>
    ({
      headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? value : null) },
    }) as unknown as Request;

  it('rejects an honestly-declared oversized body', () => {
    expect(exceedsTotalUploadSize(withContentLength(String(MAX_TOTAL_UPLOAD_BYTES + 1)))).toBe(true);
  });

  it('passes a normal upload through', () => {
    expect(exceedsTotalUploadSize(withContentLength(String(ONE_MB)))).toBe(false);
  });

  // These two document why the fast path cannot be the enforcement point: it
  // has nothing to act on, so it must say "not too large" and let the real cap
  // in readImportForm() make the call.
  it('cannot judge a request with no Content-Length', () => {
    expect(exceedsTotalUploadSize(withContentLength(null))).toBe(false);
  });

  it('cannot judge a request with an unparseable Content-Length', () => {
    expect(exceedsTotalUploadSize(withContentLength('not-a-number'))).toBe(false);
  });
});

describe('readImportForm body ceiling (SPE-443)', () => {
  // 60 chunks = 60 MB, comfortably past the 41 MB ceiling but small enough that
  // a regression fails fast rather than thrashing the runner.
  const SAFETY_LIMIT_CHUNKS = 60;

  // The read must stop on the chunk that crosses the ceiling: one to exceed it,
  // plus one the stream's internal queue has already pulled ahead.
  const MAX_EXPECTED_CHUNKS = Math.ceil(MAX_TOTAL_UPLOAD_BYTES / ONE_MB) + 2;

  it('caps an unbounded body that omits Content-Length', async () => {
    const { stream, pulled } = unboundedBody(SAFETY_LIMIT_CHUNKS);
    const request = streamingRequest(stream, {
      'content-type': 'multipart/form-data; boundary=----test',
    });

    await expect(readImportForm(request)).rejects.toBeInstanceOf(UploadTooLargeError);

    // Stopped at the ceiling rather than draining the stream.
    expect(pulled()).toBeLessThanOrEqual(MAX_EXPECTED_CHUNKS);
  });

  it('caps an unbounded body that understates Content-Length', async () => {
    const { stream, pulled } = unboundedBody(SAFETY_LIMIT_CHUNKS);
    const request = streamingRequest(stream, {
      'content-type': 'multipart/form-data; boundary=----test',
      // A deliberate lie: the fast path sees a 1 KB upload and waves it through.
      'content-length': '1024',
    });

    await expect(readImportForm(request)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(pulled()).toBeLessThanOrEqual(MAX_EXPECTED_CHUNKS);
  });

  it('still parses a legitimate upload sent without Content-Length', async () => {
    // The guard must cap unbounded bodies without rejecting every chunked
    // client outright — a within-ceiling upload has to keep working.
    const { bytes, contentType } = encodeMultipart();
    const request = streamingRequest(bodyFrom(bytes), { 'content-type': contentType });

    const form = await readImportForm(request);

    expect(form.studentsFile?.name).toBe('students.csv');
    expect(await form.studentsFile?.text()).toBe(CSV_BODY);
    expect(form.currentSchoolId).toBe('school-1');
    expect(form.currentSchoolSite).toBe('Bancroft Elementary');
    expect(form.deliveriesFile).toBeNull();
  });

  it('reads the form directly when the request exposes no body stream', async () => {
    // Nothing to buffer means nothing to cap. Callers that hand over an
    // already-parsed form (as the route tests do) must keep working.
    const stub = {
      url: URL_UNDER_TEST,
      method: 'POST',
      formData: async () => ({ get: (k: string) => (k === 'currentSchoolId' ? 'school-9' : null) }),
    } as unknown as Request;

    const form = await readImportForm(stub);

    expect(form.currentSchoolId).toBe('school-9');
    expect(form.studentsFile).toBeNull();
  });
});
