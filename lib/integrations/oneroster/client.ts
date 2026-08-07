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
 * bodies can echo the request). Every log call in this file is status + path +
 * phase, and there is no branch that widens that.
 *
 * Auth layering note (SPE-397 asks for this explicitly): the token request is
 * isolated in `fetchToken` so that OneRoster 1.2's scoped client-credentials
 * flow can be added beside it later without touching the request path. 1.2 is
 * NOT implemented here.
 */

import { logger } from '@/lib/logger';
import {
  ONEROSTER_API_PATH,
  ONEROSTER_SCOPE,
  type OneRosterConnectionConfig,
} from './config';
import type {
  OneRosterTokenResponse,
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
   * Credentials go in the Authorization header via HTTP Basic, not in the body.
   * Both are permitted by RFC 6749, but a body parameter is far more likely to
   * be captured by an intermediary's request logging, and this is a district's
   * long-lived SIS credential rather than a short-lived token.
   */
  async fetchToken(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    if (this.token) return this.token;

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
      scope: ONEROSTER_SCOPE,
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

    this.token = parsed.access_token;
    return this.token;
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
        // Status and path only. A OneRoster error body can echo the submitted
        // credentials, so it is never logged and never surfaced.
        logger.error('OneRoster API request failed', {
          status: res.status,
          path,
          phase,
        });
        throw new OneRosterApiError(
          `OneRoster responded ${res.status} for ${path}`,
          res.status,
          path,
          phase,
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
