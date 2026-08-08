/**
 * OneRoster v1.1 — connection config (SPE-397).
 *
 * Unlike the Aeries native client, there is no env-var fallback and no demo
 * instance: OneRoster is per-district by construction, and every field here
 * comes from a district's own API Security page. The config is passed in from
 * the stored connection row (SPE-395), never resolved from the environment.
 *
 * WHY TWO URLS. OneRoster splits the token endpoint from the data endpoints,
 * and on Aeries-hosted districts they are on the same host but different paths
 * (`/admin/token/` vs `/admin/ims/oneroster/v1p1/...`). Other SIS vendors put
 * them on entirely different hosts. So we ask for both rather than deriving one
 * from the other — deriving it is the kind of guess that works for the pilot
 * district and fails for the second one.
 */

/** The version segment we speak. 1.2 is deliberately not implemented yet. */
export const ONEROSTER_API_PATH = '/ims/oneroster/v1p1';

/**
 * The core read-only rostering scope — orgs, schools, users, classes,
 * enrollments per the IMS v1.1 table. Deliberately excludes
 * `roster-demographics.readonly`: demographics is the one OneRoster scope that
 * carries birthdate, sex and race, and this flow has no use for any of it.
 */
export const ONEROSTER_CORE_SCOPE =
  'https://purl.imsglobal.org/spec/or/v1p1/scope/roster-core.readonly';

/**
 * What we actually request: the core scope PLUS the umbrella read-only scope,
 * space-separated per RFC 6749 §3.3.
 *
 * The dual request exists because Aeries' enforcement does not follow the
 * spec's scope table: JSUSD's server granted full `roster-core.readonly` and
 * still refused `/enrollments`, an endpoint that scope covers on paper
 * (SPE-435, owner-approved experiment 2026-08-08). `roster.readonly` is the
 * standard's superset WITHOUT demographics, so the request stays free of
 * birthdate, sex and race either way — a district reviewing the grant still
 * sees read-only rostering and nothing more.
 *
 * A server that refuses the unfamiliar pair with `invalid_scope` gets one
 * retry with the core scope alone (see `fetchToken`), so a district that was
 * signing in yesterday still signs in today.
 */
export const ONEROSTER_SCOPE = `${ONEROSTER_CORE_SCOPE} https://purl.imsglobal.org/spec/or/v1p1/scope/roster.readonly`;

export interface OneRosterConnectionConfig {
  /** Base URL up to but NOT including `/ims/oneroster/v1p1`. */
  baseUrl: string;
  /** Full URL of the OAuth2 token endpoint. */
  tokenUrl: string;
  /** Aeries calls these the Consumer ID and Consumer Secret Key. */
  clientId: string;
  clientSecret: string;
}
