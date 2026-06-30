/**
 * Aeries SIS API — connection config.
 *
 * Aeries is a per-district integration: each district issues its own 32-char
 * read-only certificate and has its own base URL
 * (`https://<district>.aeries.net/aeries/api/v5`). For this first phase we read
 * a single connection from server env vars; per-district persistence is a later
 * PR (see the SIS Integration project, SPE-122/123).
 *
 * The certificate is a server-side secret and MUST NEVER reach the browser —
 * every call is server-to-server.
 */

/** API version segment. v5 is current (v1–v4 were folded into v5). */
export const AERIES_API_VERSION = 'v5';

/**
 * Public Aeries demo instance. Lets us build and test against real response
 * shapes before a district certificate is provisioned (SPE-120/121). The demo
 * certificate is published in Aeries' own documentation and is read-only.
 */
export const AERIES_DEMO_BASE_URL = 'https://demo.aeries.net/aeries/api/v5';
export const AERIES_DEMO_CERTIFICATE = '477abe9e7d27439681d62f4e0de1f5e1';

export interface AeriesConnectionConfig {
  /** Full base URL up to and including the version segment. */
  baseUrl: string;
  /** 32-char, case-sensitive vendor certificate. */
  certificate: string;
}

/** Normalizes a base URL (strips a single trailing slash). */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Resolve the Aeries connection from the environment.
 *
 * `AERIES_BASE_URL` / `AERIES_CERTIFICATE` override the defaults; when unset we
 * fall back to the public demo instance so local/dev work needs no secrets.
 *
 * @throws if a non-demo base URL is configured without a certificate.
 */
export function getAeriesConfig(
  env: NodeJS.ProcessEnv = process.env,
): AeriesConnectionConfig {
  const hasBaseUrl = Boolean(env.AERIES_BASE_URL);
  const hasCertificate = Boolean(env.AERIES_CERTIFICATE);
  const baseUrl = normalizeBaseUrl(env.AERIES_BASE_URL || AERIES_DEMO_BASE_URL);
  const certificate = env.AERIES_CERTIFICATE || '';

  // Base URL + certificate are a required pair for a district instance. A cert
  // without a base URL would silently target the demo host with district
  // credentials — reject it rather than produce confusing auth failures.
  if (hasCertificate && !hasBaseUrl) {
    throw new Error(
      'Aeries base URL missing: set AERIES_BASE_URL when AERIES_CERTIFICATE is ' +
        'configured (leave both unset to use the read-only demo instance).',
    );
  }

  if (baseUrl === normalizeBaseUrl(AERIES_DEMO_BASE_URL) && !certificate) {
    return { baseUrl, certificate: AERIES_DEMO_CERTIFICATE };
  }

  if (!certificate) {
    throw new Error(
      'Aeries certificate missing: set AERIES_CERTIFICATE (32-char vendor cert) ' +
        'when AERIES_BASE_URL points at a real district instance.',
    );
  }

  return { baseUrl, certificate };
}
