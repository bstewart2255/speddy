/**
 * OneRoster v1.1 — server-only REST client (SPE-397).
 *
 * Two-step auth, which is the whole reason this client exists separately from
 * the Aeries one: POST the client credentials to the token endpoint, get a
 * bearer token, then send that token on the data requests. Aeries' native API
 * is a single header on every call.
 *
 * That split is not just plumbing — it is the diagnostic. "Your credentials are
 * wrong" and "your credentials are fine but this data isn't shared" arrive at
 * different steps, and a district can only act on the difference if we keep
 * them apart. `OneRosterApiError.phase` carries it.
 *
 * SECRETS. Three things here must never leave the server or reach a log: the
 * client secret, the bearer token, and any response body (OneRoster error
 * bodies can echo the request).
 *
 * Exactly TWO things are derived from a response body, and both are worth
 * stating precisely because they are the only holes in the rule above — and
 * both are allow-lists, which is why they are safe. On a failed TOKEN request:
 * the RFC 6749 `error` code, only when its value is one of the six constants
 * in `OAUTH_ERROR_CODES` (SPE-430); and the body's STRUCTURE — kind, length,
 * and field names matched against `KNOWN_ERROR_FIELD_NAMES` (SPE-434). A fixed
 * vocabulary cannot carry a secret, however hostile or malformed the body.
 * Nothing else from any body is read, logged or surfaced; `error_description`,
 * which is free text from the district's server, deliberately is not. Every
 * log call is status + path + phase, plus those allow-listed derivations.
 *
 * Auth layering note (SPE-397 asks for this explicitly): the token request is
 * isolated in `fetchToken` so that OneRoster 1.2's scoped client-credentials
 * flow can be added beside it later without touching the request path. 1.2 is
 * NOT implemented here.
 */

import { logger } from '@/lib/logger';
import {
  ONEROSTER_API_PATH,
  ONEROSTER_CORE_SCOPE,
  ONEROSTER_SCOPE,
  type OneRosterConnectionConfig,
} from './config';
import type {
  OneRosterTokenResponse,
  RawOneRosterClass,
  RawOneRosterEnrollment,
  RawOneRosterOrg,
  RawOneRosterSchool,
  RawOneRosterUser,
} from './types';

const DEFAULT_TIMEOUT_MS = 30_000;

/** Page size for `getAllPages`. Conservative — these are district SISs. */
export const ONEROSTER_DEFAULT_PAGE_SIZE = 1000;
/** Hard cap on pages walked, so a server that ignores `offset` cannot loop. */
const MAX_PAGES = 1000;

/**
 * `application/x-www-form-urlencoded`, per RFC 6749 §2.3.1 / Appendix B.
 *
 * Delegated to `URLSearchParams` rather than hand-rolled. The first version was
 * `encodeURIComponent(v).replace(/%20/g, '+')`, which gets `:`, `%` and space
 * right — the three that actually change behaviour — but leaves `!`, `'`, `(`,
 * `)` and `~` unescaped, where form encoding percent-escapes them.
 *
 * For a compliant server that difference is invisible: `!` and `%21` both
 * decode to `!`. The reason to use the platform's implementation anyway is that
 * it removes the question entirely — nobody has to re-derive which characters
 * this needs to cover, which is exactly how the hand-rolled version was wrong.
 */
function formEncode(value: string): string {
  return new URLSearchParams({ value }).toString().slice('value='.length);
}

/** Which half of the exchange failed. The district-facing advice differs entirely. */
export type OneRosterPhase = 'token' | 'request';

/**
 * The complete set of OAuth 2.0 token-endpoint error codes (RFC 6749 §5.2).
 *
 * An ALLOW-LIST, and that is the entire safety argument. A token endpoint's
 * error body can echo the credentials that were submitted to it, so the body is
 * never read, logged or surfaced — except for a single `error` field, and only
 * when its value is one of these six constants. A hostile or malformed body
 * cannot smuggle a secret through a fixed set of six strings.
 */
const OAUTH_ERROR_CODES = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
]);

/**
 * The structure of a refused token response — categories and counts only.
 *
 * Every string here is one of OUR OWN constants, matched against the response
 * rather than copied out of it. That is the entire safety argument, and it is
 * the same one `OAUTH_ERROR_CODES` makes: a fixed vocabulary cannot carry a
 * secret, however hostile or echo-happy the server. Even a field NAME or a
 * content-type header could be crafted from the submitted credential, so
 * neither is ever logged verbatim — an unrecognised name becomes a count.
 */
interface TokenRefusalShape {
  /** One of `KNOWN_CONTENT_TYPES`, or 'other' / 'none'. */
  contentType: string;
  bodyKind: 'json' | 'json-nonobject' | 'xml' | 'html' | 'text' | 'empty';
  /** Length of the body text — enough to tell an empty refusal from an essay. */
  bodyChars: number;
  /**
   * JSON objects only: the top-level names that EXACTLY match a member of
   * `KNOWN_ERROR_FIELD_NAMES`, sorted, plus one `+N unrecognised` entry for
   * the rest. Sorted because key order is server-chosen data too.
   */
  fieldNames?: string[];
}

/**
 * Field names that identify WHICH error dialect the server speaks — RFC 6749,
 * ASP.NET Web API, or RFC 7807 problem+json.
 *
 * Matched EXACTLY, which is what lets the log claim to contain only our own
 * constants: a case-insensitive match would log the server's verbatim casing,
 * and per-character case choices (or a Unicode character that merely
 * case-folds into a constant, like the Kelvin sign into 'k') are a channel for
 * server-chosen bytes. The dialects that differ by case are enumerated in the
 * casing they actually ship.
 */
const KNOWN_ERROR_FIELD_NAMES = new Set([
  // RFC 6749 §5.2
  'error',
  'error_description',
  'error_uri',
  // ASP.NET Web API's default error envelope, in its shipped PascalCase
  'Message',
  'ExceptionMessage',
  'ExceptionType',
  'ModelState',
  'StackTrace',
  // the same names as ad-hoc servers usually write them
  'message',
  'exceptionMessage',
  'exceptionType',
  'modelState',
  'stackTrace',
  // RFC 7807 problem+json
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'errors',
  // Common ad-hoc shapes
  'code',
  'description',
]);

const KNOWN_CONTENT_TYPES = new Set([
  'application/json',
  'application/problem+json',
  'text/html',
  'text/plain',
  'application/xml',
  'text/xml',
]);

const IMS_SCOPE_PREFIX = 'https://purl.imsglobal.org/spec/or/v1p1/scope/';

/**
 * Every scope OneRoster v1.1 defines. The token response's `scope` field
 * states what the server actually granted; entries are logged only when they
 * match one of these constants (shortened by the shared prefix), so the log
 * stays inside our own vocabulary even against a server that echoes.
 */
const KNOWN_ONEROSTER_SCOPES = new Set(
  [
    'roster-core.readonly',
    'roster.readonly',
    'roster-demographics.readonly',
    'resource.readonly',
    'gradebook.readonly',
    'gradebook.createput',
    'gradebook.delete',
  ].map((s) => `${IMS_SCOPE_PREFIX}${s}`),
);

/**
 * Read a refused token response for its RFC 6749 error code AND its shape.
 *
 * The code half exists because a 400 from a token endpoint is ambiguous in the
 * one way that matters: `invalid_client` means the district's Consumer ID and
 * Secret are wrong; `invalid_scope` or `unsupported_grant_type` means OUR
 * request is wrong and their credentials are fine (SPE-430).
 *
 * The shape half exists because the first live district answered with a 400
 * carrying NO recognised code at all — which the spec forbids — and the
 * allow-list correctly discarded everything else, leaving nothing to diagnose
 * with (SPE-434). Structure fills that gap without touching content: an
 * ASP.NET `{"Message": …}` points at our request format, an OAuth-shaped body
 * speaking a non-standard vocabulary points at their configuration, an HTML
 * page says this is not a token endpoint at all.
 *
 * The safety rule is unchanged and load-bearing: the body can echo the
 * submitted credentials, so no VALUE from it is ever returned except `error`,
 * allow-listed against six fixed constants, and no NAME except against the
 * fixed vocabulary above. `error_description` — where servers most often echo
 * the secret — is never read.
 *
 * Never throws: a diagnostic that can fail the request it is diagnosing is
 * worse than no diagnostic.
 */
async function describeTokenRefusal(
  res: Response,
): Promise<{ oauthError?: string; shape: TokenRefusalShape }> {
  const rawContentType = res.headers.get('content-type');
  const mediaType = rawContentType ? rawContentType.split(';')[0].trim().toLowerCase() : '';
  const contentType = !mediaType ? 'none' : KNOWN_CONTENT_TYPES.has(mediaType) ? mediaType : 'other';

  let text = '';
  try {
    text = await res.text();
  } catch {
    // An unreadable body reads as empty; the status still tells its story.
  }
  const bodyChars = text.length;
  const trimmed = text.trim();
  if (!trimmed) {
    return { shape: { contentType, bodyKind: 'empty', bodyChars } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // XML before HTML (Codex, PR #826): both start with '<', but they carry
    // opposite diagnoses — an XML error document is a framework SPEAKING to
    // us, an HTML page is a gateway or a wrong address. Decided from two
    // signals that are already ours: the allow-listed media type constant and
    // the fixed '<?xml' prolog. No content is copied either way.
    const declaredXml = contentType === 'application/xml' || contentType === 'text/xml';
    const bodyKind =
      declaredXml || trimmed.startsWith('<?xml')
        ? 'xml'
        : trimmed.startsWith('<')
          ? 'html'
          : 'text';
    return { shape: { contentType, bodyKind, bodyChars } };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { shape: { contentType, bodyKind: 'json-nonobject', bodyChars } };
  }

  const fieldNames: string[] = [];
  let unrecognised = 0;
  for (const key of Object.keys(parsed)) {
    if (KNOWN_ERROR_FIELD_NAMES.has(key)) {
      fieldNames.push(key);
    } else {
      unrecognised += 1;
    }
  }
  fieldNames.sort();
  if (unrecognised > 0) fieldNames.push(`+${unrecognised} unrecognised`);

  const code = (parsed as { error?: unknown }).error;
  const oauthError = typeof code === 'string' && OAUTH_ERROR_CODES.has(code) ? code : undefined;
  return { oauthError, shape: { contentType, bodyKind: 'json', bodyChars, fieldNames } };
}

/** Raised on a non-2xx from either the token endpoint or a data endpoint. */
export class OneRosterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly phase: OneRosterPhase,
    /**
     * The endpoint answered, but its response could not be used as a token —
     * not JSON, or JSON with no `access_token`.
     *
     * Distinct from `status`, deliberately. Both of those are raised with a
     * synthetic 502, and a real upstream 502 from a gateway is a completely
     * different situation: the token endpoint EXISTS and is broken, so
     * resolution must stop rather than post the district's consumer secret to
     * another candidate. Without this flag the two are indistinguishable.
     */
    readonly unusableTokenResponse = false,
    /**
     * The RFC 6749 error code the token endpoint returned, when it returned a
     * recognised one. Always one of `OAUTH_ERROR_CODES` or undefined — never
     * free text from the response body, which can echo the credentials.
     *
     * This is what tells "your credentials are wrong" apart from "our request
     * is wrong", which a 400 alone cannot.
     */
    readonly oauthError?: string,
  ) {
    super(message);
    this.name = 'OneRosterApiError';
  }
}

export interface OneRosterRequestOptions {
  /** 1-based pagination (`limit`/`offset` in OneRoster's vocabulary). */
  limit?: number;
  offset?: number;
  /** Extra query params passed through verbatim. */
  query?: Record<string, string | number>;
  /** Per-request timeout in ms (default 30s). */
  timeoutMs?: number;
}

export class OneRosterClient {
  private readonly config: OneRosterConnectionConfig;
  /** Cached for the lifetime of this client instance only — never persisted. */
  private token: string | null = null;

  constructor(config: OneRosterConnectionConfig) {
    this.config = config;
  }

  /**
   * Exchange the consumer ID and secret for a bearer token.
   *
   * Requests the dual read-only scope, and if the server rejects that outright
   * with `invalid_scope` — RFC 6749 lets a server refuse rather than narrow —
   * retries ONCE with the core scope alone. The experiment the dual request
   * exists for (SPE-435) must never cost a district a sign-in that worked
   * yesterday.
   */
  async fetchToken(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    if (this.token) return this.token;
    try {
      this.token = await this.exchange(ONEROSTER_SCOPE, timeoutMs);
    } catch (err) {
      const dualRefused =
        err instanceof OneRosterApiError &&
        err.phase === 'token' &&
        err.oauthError === 'invalid_scope';
      if (!dualRefused) throw err;
      logger.info('OneRoster dual-scope request refused; retrying with the core scope alone');
      this.token = await this.exchange(ONEROSTER_CORE_SCOPE, timeoutMs);
    }
    return this.token;
  }

  /**
   * One token request for one scope string.
   *
   * Credentials go in the Authorization header via HTTP Basic, not in the body.
   * Both are permitted by RFC 6749, but a body parameter is far more likely to
   * be captured by an intermediary's request logging, and this is a district's
   * long-lived SIS credential rather than a short-lived token.
   */
  private async exchange(scope: string, timeoutMs: number): Promise<string> {
    // Each component is form-urlencoded BEFORE being joined and base64'd, per
    // RFC 6749 §2.3.1. For the ordinary alphanumeric credential this is a
    // no-op, so it costs nothing in the common case — but Basic auth splits on
    // the FIRST colon, so a consumer ID containing one produces a credential
    // the token endpoint cannot parse back. The route deliberately accepts any
    // credential shape (vendors differ and there is nothing safe to validate
    // against), which is exactly why this cannot assume a safe character set.
    const basic = Buffer.from(
      `${formEncode(this.config.clientId)}:${formEncode(this.config.clientSecret)}`,
    ).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope,
    });

    const res = await this.dial(
      this.config.tokenUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      },
      'token',
      timeoutMs,
      'token endpoint',
    );

    let parsed: OneRosterTokenResponse;
    try {
      parsed = (await res.json()) as OneRosterTokenResponse;
    } catch {
      throw new OneRosterApiError(
        'The token endpoint did not return JSON.',
        502,
        'token endpoint',
        'token',
        true,
      );
    }

    if (!parsed?.access_token) {
      // A 200 with no token is a real OneRoster failure mode, and reporting it
      // as a network problem would send the district looking at their firewall.
      throw new OneRosterApiError(
        'The token endpoint answered but returned no access token.',
        502,
        'token endpoint',
        'token',
        true,
      );
    }

    // What the server GRANTED, versus what we asked for. JSUSD's first live
    // probe hit a 403 on /enrollments with everything else green (SPE-435),
    // and this is the field that says whether the grant itself was narrower
    // than our request — or the refusal lives in the district's console.
    // Same allow-list rule as every derivation in this file: the logged names
    // are matched against our own constants, and anything else is a count.
    // Attributed by token endpoint (host + path) — two districts' tests can
    // fetch tokens in the same minute, and an unattributable grant line
    // answers nothing. Host ALONE is not enough: a multi-tenant SIS serves
    // districts from one host, separated by path (Codex, PR #828). Both parts
    // are operator-entered configuration, not response text and not a secret.
    let tokenEndpoint = 'unparseable';
    try {
      const u = new URL(this.config.tokenUrl);
      tokenEndpoint = `${u.hostname}${u.pathname}`;
    } catch {
      // Never let attribution break the exchange itself.
    }
    if (typeof parsed.scope === 'string') {
      // A Set: servers can repeat a scope value, and a duplicated grant line
      // reads as a different grant than yesterday's (CodeRabbit, PR #828).
      const granted = new Set<string>();
      let unrecognised = 0;
      for (const entry of parsed.scope.split(/\s+/).filter(Boolean)) {
        if (KNOWN_ONEROSTER_SCOPES.has(entry)) {
          granted.add(entry.slice(IMS_SCOPE_PREFIX.length));
        } else {
          unrecognised += 1;
        }
      }
      logger.info('OneRoster token granted', {
        tokenEndpoint,
        grantedScopes: [...granted].sort(),
        unrecognisedScopes: unrecognised,
      });
    } else {
      logger.info('OneRoster token granted', { tokenEndpoint, grantedScopes: 'not stated' });
    }

    return parsed.access_token;
  }

  /** GET a OneRoster collection, fetching a token first if needed. */
  async get<T>(path: string, options: OneRosterRequestOptions = {}): Promise<T> {
    const token = await this.fetchToken(options.timeoutMs);
    const url = this.buildUrl(path, options);

    const res = await this.dial(
      url,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      },
      'request',
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      path,
    );

    try {
      return (await res.json()) as T;
    } catch {
      throw new OneRosterApiError(
        `${path} answered but did not return JSON.`,
        502,
        path,
        'request',
      );
    }
  }

  // -- Typed endpoint helpers -------------------------------------------------

  /** `GET /orgs` — districts and schools. The first call that needs real access. */
  async getOrgs(options?: OneRosterRequestOptions): Promise<RawOneRosterOrg[]> {
    return this.collection<RawOneRosterOrg>('orgs', options);
  }

  /** `GET /schools` — orgs already filtered to schools. */
  async getSchools(options?: OneRosterRequestOptions): Promise<RawOneRosterSchool[]> {
    return this.collection<RawOneRosterSchool>('schools', options);
  }

  /** `GET /students` — the roster. Used by the SPE-398 exploration tooling. */
  async getStudents(options?: OneRosterRequestOptions): Promise<RawOneRosterUser[]> {
    return this.namedCollection<RawOneRosterUser>('students', 'users', options);
  }

  /** `GET /teachers` — needed to resolve a Speddy teacher to a SIS teacher. */
  async getTeachers(options?: OneRosterRequestOptions): Promise<RawOneRosterUser[]> {
    return this.namedCollection<RawOneRosterUser>('teachers', 'users', options);
  }

  /** `GET /enrollments` — the student↔class↔teacher edges (SPE-398 report 3). */
  async getEnrollments(options?: OneRosterRequestOptions): Promise<RawOneRosterEnrollment[]> {
    return this.namedCollection<RawOneRosterEnrollment>('enrollments', 'enrollments', options);
  }

  /** `GET /classes` — titles, types and periods for future link labels (SPE-435). */
  async getClasses(options?: OneRosterRequestOptions): Promise<RawOneRosterClass[]> {
    return this.namedCollection<RawOneRosterClass>('classes', 'classes', options);
  }

  /**
   * Walk a collection to completion, in bounded pages.
   *
   * OneRoster paginates with `limit`/`offset`, and a single large `limit` is
   * not a substitute: servers cap it silently, so a district bigger than the
   * guess comes back truncated with no indication. That failure is especially
   * nasty for the SPE-398 reports — a short roster makes the DISTRICT's data
   * look incomplete, when the truncation was ours.
   *
   * Exhausting MAX_PAGES without a short page throws rather than returning what
   * it has, for the same reason: silently truncated results here become a wrong
   * match rate that nobody re-checks.
   */
  async getAllPages<T>(
    path: string,
    key: string,
    options: Omit<OneRosterRequestOptions, 'limit' | 'offset'> & { pageSize?: number } = {},
  ): Promise<T[]> {
    const { pageSize = ONEROSTER_DEFAULT_PAGE_SIZE, ...rest } = options;
    const all: T[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await this.namedCollection<T>(path, key, {
        ...rest,
        limit: pageSize,
        offset: page * pageSize,
      });
      all.push(...batch);
      if (batch.length < pageSize) return all;
    }

    throw new OneRosterApiError(
      `OneRoster pagination exceeded ${MAX_PAGES} pages for ${path}; aborting rather than ` +
        'returning a silently truncated collection',
      508,
      path,
      'request',
    );
  }

  /**
   * Read a OneRoster collection, refusing anything that isn't one.
   *
   * `body?.orgs ?? []` was the obvious shape and it was wrong in a way that
   * matters more than a crash: a 200 carrying `{"error": "..."}` — a proxy
   * error page, a maintenance response, an HTML-to-JSON gateway — produced an
   * empty array, which the diagnostics reported as "Working." with a count of
   * zero. The district was told "Connected. OneRoster is ready." about a
   * response we could not use at all, which is the one failure this whole
   * feature exists to prevent.
   *
   * An empty roster is legitimate and stays legitimate; a MISSING collection is
   * not. Only the latter is refused.
   */
  private async collection<T>(
    path: string,
    options?: OneRosterRequestOptions,
  ): Promise<T[]> {
    return this.namedCollection<T>(path, 'orgs', options);
  }

  /**
   * The same refusal, for collections OneRoster names something other than
   * `orgs` — `users` for students and teachers, `enrollments` for enrollments.
   * Kept as one function so the "a 200 is not automatically a collection" rule
   * cannot hold for some endpoints and quietly lapse for others.
   */
  private async namedCollection<T>(
    path: string,
    key: string,
    options?: OneRosterRequestOptions,
  ): Promise<T[]> {
    const body = await this.get<Record<string, unknown>>(path, options);
    const rows = body?.[key];
    if (!Array.isArray(rows)) {
      throw new OneRosterApiError(
        `${path} answered, but not with a OneRoster collection.`,
        502,
        path,
        'request',
      );
    }
    return rows as T[];
  }

  // -- Internal ---------------------------------------------------------------

  /**
   * The one place a request actually leaves this process, so the transport
   * policy is stated once and cannot drift between the token call and the data
   * calls — which is exactly how a hardened request path grows a soft spot.
   */
  private async dial(
    url: string,
    init: RequestInit,
    phase: OneRosterPhase,
    timeoutMs: number,
    path: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        // Never cache: tokens are credentials and roster data is student PII.
        cache: 'no-store',
        // Refuse redirects outright, same reasoning as the Aeries client
        // (SPE-396): the base and token URLs are district-supplied and checked
        // against private-network ranges before we dial them, but that check
        // covers the host WE resolve. Following a 302 hands the destination
        // back to the remote server, which would let a public host bounce a
        // request carrying the district's OneRoster secret into an internal
        // address and defeat the guard entirely.
        redirect: 'error',
      });

      if (!res.ok) {
        // The body is still never logged or surfaced — it can echo the
        // submitted credentials. Two derived exceptions, both bounded: the
        // RFC 6749 `error` code when it matches the fixed six-value
        // allow-list, and the body's STRUCTURE (kind, sanitized field names,
        // length), which is metadata about the content rather than the
        // content. Reading them here is safe because a failed response is
        // thrown, never returned to a caller.
        const refusal = phase === 'token' ? await describeTokenRefusal(res) : undefined;
        const oauthError = refusal?.oauthError;
        // Diagnostics ride in the META slot, where the logger stringifies
        // them into the formatted line and — per SPE-167 — never forwards
        // them to Sentry. (Sentry still records one captureMessage per failed
        // candidate, exactly as before; what changed is that the payload
        // stays out of it.) The previous shape passed this object as the
        // `error` argument — a loose positional value that a line-capturing
        // pipeline would drop entirely.
        logger.error('OneRoster API request failed', undefined, {
          status: res.status,
          path,
          phase,
          oauthError,
          refusalShape: refusal?.shape,
        });
        throw new OneRosterApiError(
          `OneRoster responded ${res.status} for ${path}`,
          res.status,
          path,
          phase,
          false,
          oauthError,
        );
      }

      return res;
    } catch (err) {
      if (err instanceof OneRosterApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OneRosterApiError(
          `OneRoster request timed out after ${timeoutMs}ms for ${path}`,
          408,
          path,
          phase,
        );
      }
      logger.error('OneRoster API request error', err, { path, phase });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(path: string, options: OneRosterRequestOptions): string {
    const cleanPath = path.replace(/^\/+/, '');
    // A stored base_url can carry a trailing slash — normalizeOneRosterBaseUrl
    // strips one at write time, but the test path re-validates a stored row
    // without re-normalizing it. `...//ims/oneroster/v1p1/orgs` 404s on most
    // servers, and the district then reads "that address has no OneRoster data"
    // about an address that is perfectly correct.
    const base = this.config.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}${ONEROSTER_API_PATH}/${cleanPath}`);

    if (options.limit != null) url.searchParams.set('limit', String(options.limit));
    if (options.offset != null) url.searchParams.set('offset', String(options.offset));
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }
}
