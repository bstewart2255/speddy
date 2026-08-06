/**
 * OneRoster v1.1 — type definitions (SPE-397).
 *
 * Only the two collections the connection test reads are typed. OneRoster
 * returns a large permissive payload; we keep an index signature so unknown
 * fields don't break parsing, and we type only what we consume.
 *
 * Spec: https://www.imsglobal.org/oneroster-v11-final-specification
 *
 * NOTE ON WHAT IS ABSENT. There is no special-education anything in OneRoster
 * v1.1 — no IEP flag, no program membership, no eligibility date. That is a
 * property of the standard, not of this file, and it is the reason SPE-397
 * calls OneRoster an owner-accepted limitation rather than a second path to the
 * same data.
 */

/** An org from `GET /orgs`. Districts and schools are both orgs; `type` says which. */
export interface RawOneRosterOrg {
  sourcedId: string;
  name?: string;
  type?: 'department' | 'school' | 'district' | 'local' | 'state' | 'national';
  status?: 'active' | 'tobedeleted';
  [key: string]: unknown;
}

/** A school from `GET /schools` — an org already filtered to `type: 'school'`. */
export interface RawOneRosterSchool extends RawOneRosterOrg {
  [key: string]: unknown;
}

/**
 * The OAuth2 token response.
 *
 * `access_token` is a bearer credential: it must never be logged, persisted, or
 * returned to the browser. It lives for the duration of one connection test.
 */
export interface OneRosterTokenResponse {
  /**
   * Optional because the client casts an UNVALIDATED JSON body to this type.
   * Declaring it required would state a guarantee the parse does not make, and
   * would let a future caller skip the runtime check that catches a 200 with no
   * token in it.
   */
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}
