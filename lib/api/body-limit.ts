/**
 * Request-body size ceilings for routes that accept uploads (SPE-505).
 *
 * Generalised from the import-specific guard added by SPE-443. The problem it
 * solves is the same everywhere: `formData()` and `json()` buffer the WHOLE
 * request body into memory before a handler can look at it, so any per-file
 * check a route runs afterwards is too late to prevent memory exhaustion. A
 * `Content-Length` check can't stand in for it either — a client that omits the
 * header, uses chunked transfer-encoding, or simply understates the length
 * skips it entirely.
 *
 * So the ceiling is enforced on the bytes actually read, by counting them in a
 * pass-through stream. Nothing is pre-buffered: chunks flow straight on to the
 * parser and the read is torn down on the chunk that crosses the line, which
 * matters because a guard meant to bound memory must not itself hold a second
 * full copy of the body.
 *
 * These ceilings are memory backstops, NOT product limits. Each is set loose
 * enough that a legitimate request cannot hit it — the real per-file rules stay
 * where they already live in each route.
 */

/** Thrown when a body read passes the ceiling it was given. */
export class BodyTooLargeError extends Error {
  constructor(message = 'Request body exceeds the size ceiling') {
    super(message);
    this.name = 'BodyTooLargeError';
  }
}

const MB = 1024 * 1024;

/**
 * Ceilings per upload route. Each is deliberately above what the route's own
 * validation already accepts, so capping cannot reject a request that works
 * today — see the note on each.
 */
export const BODY_LIMITS = {
  /**
   * Worksheet submissions. The route already rejects images over 10 MB
   * (validateImageBuffer), and its JSON branch carries the image base64-encoded
   * — roughly 4/3 the raw bytes — so the ceiling has to clear 13.4 MB plus the
   * surrounding JSON before it can bite.
   */
  submitWorksheet: 16 * MB,
  /** Saved worksheets: the route already rejects files over 10 MB. */
  savedWorksheet: 12 * MB,
  /**
   * IEP goals import: a goals spreadsheet. No per-file check exists on this
   * route today; 12 MB matches the 10 MB-per-file convention that the sibling
   * student import already enforces.
   */
  iepGoalsImport: 12 * MB,
  /**
   * Attached documents (IEP PDFs, reports, scans). validateDocumentFile already
   * rejects files over MAX_FILE_SIZE (25 MB) — but only once the body is
   * buffered — so the ceiling clears that with room for multipart framing.
   */
  document: 28 * MB,
  /**
   * The document routes' JSON branch, which records a link or pasted text
   * rather than a file. Generous for that: 2 MB of text is on the order of a
   * thousand pages.
   */
  documentMetadata: 2 * MB,
  /**
   * Accommodations extraction: the route already rejects PDFs over 4 MB, so the
   * ceiling clears that plus multipart framing.
   */
  extractAccommodations: 6 * MB,
} as const;

/**
 * True when the request's `Content-Length` *declares* a body over `limit`.
 *
 * A cheap fast path only — it rejects an honest oversized upload without
 * reading a byte, and says "not too large" whenever the header is missing or
 * unparseable because it has nothing to judge. The enforcement point is the
 * capped read below.
 */
export function declaresOversizedBody(request: Request, limit: number): boolean {
  const raw = request.headers?.get?.('content-length');
  const len = raw == null ? NaN : Number(raw);
  return Number.isFinite(len) && len > limit;
}

/**
 * Re-wrap a request so its body fails once it passes `limit`.
 *
 * Returns null when the request exposes no readable body — there is then
 * nothing to buffer and so nothing to cap, and the caller reads it directly.
 * `tripped` is reported back because the failure surfaces from the parser,
 * which may wrap the underlying stream error in its own type; the caller uses
 * the flag to answer "was this the ceiling?" rather than matching on that.
 */
function cappedRequest(
  request: Request,
  limit: number
): { request: Request; tripped: () => boolean } | null {
  const body = request.body;
  if (!body || typeof body.pipeThrough !== 'function') return null;

  let total = 0;
  let exceeded = false;
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > limit) {
          exceeded = true;
          throw new BodyTooLargeError();
        }
        controller.enqueue(chunk);
      },
    })
  );

  // Only content-type carries over: it holds the multipart boundary, whereas
  // the original content-length may disagree with what is really being sent —
  // which is the whole point of the capped read.
  const contentType = request.headers?.get?.('content-type') ?? null;
  const capped = new Request(request.url, {
    method: 'POST',
    ...(contentType ? { headers: { 'content-type': contentType } } : {}),
    body: stream,
    // undici requires this for a streaming request body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  return { request: capped, tripped: () => exceeded };
}

/** Read a multipart form, failing with BodyTooLargeError past `limit`. */
export async function readCappedFormData(request: Request, limit: number): Promise<FormData> {
  const capped = cappedRequest(request, limit);
  if (!capped) return request.formData();

  try {
    return await capped.request.formData();
  } catch (error) {
    if (capped.tripped()) throw new BodyTooLargeError();
    throw error;
  }
}

/** Read a JSON body, failing with BodyTooLargeError past `limit`. */
export async function readCappedJson<T = unknown>(request: Request, limit: number): Promise<T> {
  const capped = cappedRequest(request, limit);
  if (!capped) return (await request.json()) as T;

  try {
    return (await capped.request.json()) as T;
  } catch (error) {
    if (capped.tripped()) throw new BodyTooLargeError();
    throw error;
  }
}
