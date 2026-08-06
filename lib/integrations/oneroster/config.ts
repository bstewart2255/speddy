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
 * The single OAuth2 scope we request.
 *
 * `roster-core.readonly` covers getAllOrgs and getAllSchools — exactly the two
 * calls the connection test makes, and nothing else. It deliberately excludes
 * `roster-demographics.readonly`: demographics is the one OneRoster scope that
 * carries birthdate, sex and race, and this flow has no use for any of it. Ask
 * for the smallest scope that answers the question, so a district reviewing
 * what they granted sees a request that matches what we actually do.
 */
export const ONEROSTER_SCOPE = 'https://purl.imsglobal.org/spec/or/v1p1/scope/roster-core.readonly';

export interface OneRosterConnectionConfig {
  /** Base URL up to but NOT including `/ims/oneroster/v1p1`. */
  baseUrl: string;
  /** Full URL of the OAuth2 token endpoint. */
  tokenUrl: string;
  /** Aeries calls these the Consumer ID and Consumer Secret Key. */
  clientId: string;
  clientSecret: string;
}
