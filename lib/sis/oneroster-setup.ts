/**
 * OneRoster connection setup: URL normalization and step-wise diagnostics
 * (SPE-397).
 *
 * Same persona and same contract as the Aeries flow (`aeries-setup.ts`): a
 * district generalist who has never opened the API Security page, and a report
 * that names the fix rather than the HTTP status.
 *
 * WHAT IS DIFFERENT HERE, and why it gets its own module rather than a branch
 * inside the Aeries one:
 *
 *  1. **Two credentials, not one.** OneRoster uses the Consumer ID and Consumer
 *     Secret, which live on the same Aeries page as the certificate and are
 *     routinely confused with it. That confusion is the single most common
 *     setup failure, so the diagnostics call it out by name.
 *
 *  2. **Two steps, not one.** Getting a token and using it fail separately.
 *     "Your credentials are wrong" (token) and "your credentials are fine but
 *     nothing is shared with you" (request) send the district to two different
 *     screens, and collapsing them is exactly the round-trip this removes.
 *
 *  3. **Two URLs, not one.** The token endpoint and the data endpoints are
 *     distinct and vary by vendor, so both are asked for and both are guarded.
 *
 * Aggregate-only, identically to the Aeries flow: every step reports a count
 * and a step name, never a record. `district_tech` has no right to student data
 * (SPE-393), and OneRoster's payloads are full of it.
 *
 * Server-only: reaches an external SIS with a decrypted credential.
 */
import {
  ONEROSTER_API_PATH,
  OneRosterApiError,
  OneRosterClient,
} from '@/lib/integrations/oneroster';
import {
  ONEROSTER_URL_LABELS,
  assertPublicSisHostSyntax,
  assertSafeSisUrl,
} from './ssrf-guard';
import type { SisTestResult } from './connections';

/**
 * Normalize whatever the district pasted into a OneRoster base URL.
 *
 * They will paste what their Aeries admin page shows, which is frequently the
 * full data URL including the version segment. Appending our own path to that
 * produces `.../ims/oneroster/v1p1/ims/oneroster/v1p1/orgs`, so the version
 * segment is stripped if present rather than rejected — a district should not
 * have to know which half of the URL we wanted.
 */
export function normalizeOneRosterBaseUrl(input: string): string {
  return normalizeSisUrl(input, (url) => {
    // Strip a trailing OneRoster version path, with or without a trailing slash.
    const path = url.pathname.replace(/\/+$/, '');
    const stripped = path.endsWith(ONEROSTER_API_PATH)
      ? path.slice(0, -ONEROSTER_API_PATH.length)
      : path;
    return `${url.origin}${stripped}`;
  });
}

/**
 * Normalize the token endpoint.
 *
 * Kept whole — unlike the base URL there is no version segment to strip, and
 * the path genuinely varies between vendors (`/token`, `/token/`, `/oauth/token`).
 * Only the trailing slash is normalized, so two districts who typed the same
 * endpoint differently don't produce two different stored rows.
 */
export function normalizeOneRosterTokenUrl(input: string): string {
  return normalizeSisUrl(input, (url) => `${url.origin}${url.pathname.replace(/\/+$/, '')}`);
}

/** Shared parse/guard/https path for both URLs, so neither can skip a check. */
function normalizeSisUrl(input: string, shape: (url: URL) => string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter your OneRoster address.');

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(
      `"${trimmed}" doesn't look like a web address. It should look like ${ONEROSTER_URL_LABELS.example}`,
    );
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      'The OneRoster address must start with https:// so credentials stay encrypted.',
    );
  }

  assertPublicSisHostSyntax(url.hostname, ONEROSTER_URL_LABELS);
  return shape(url);
}

/** One step of the exchange, in the district's terms. */
export interface OneRosterStepResult {
  key: 'token' | 'orgs' | 'schools';
  label: string;
  status: 'ok' | 'denied' | 'error' | 'untested';
  /** Plain English. Never contains a name, an ID, or either credential. */
  message: string;
  /** Aggregate only — how many records the step returned, when it succeeded. */
  count?: number;
}

export interface OneRosterTestReport {
  ok: boolean;
  steps: OneRosterStepResult[];
  summary: string;
}

/**
 * Map a failure to something the district can act on.
 *
 * The 401-at-token case is the one worth the most: on Aeries-hosted districts
 * it usually means the certificate was pasted instead of the Consumer ID and
 * Secret. Same admin page, adjacent fields, completely different credential —
 * and "401 Unauthorized" gives them no way to work that out.
 */
function explain(err: unknown, step: string): { status: 'denied' | 'error'; message: string } {
  if (err instanceof OneRosterApiError) {
    if (err.phase === 'token') {
      if (err.status === 401 || err.status === 400) {
        return {
          status: 'error',
          message:
            'Those credentials were rejected. OneRoster uses the Consumer ID and Consumer Secret Key — not the certificate. Both are on Security → API Security → "Display Consumer ID & Secret Keys".',
        };
      }
      if (err.status === 404) {
        return {
          status: 'error',
          message:
            'Nothing answered at that token address. It usually ends in /token/ — check it against your Aeries OneRoster settings.',
        };
      }
      if (err.status === 408) {
        return {
          status: 'error',
          message: 'The token address did not respond in time. Try again in a moment.',
        };
      }
      return {
        status: 'error',
        message: `The token address returned an unexpected error (${err.status}).`,
      };
    }

    // phase === 'request': the credentials already worked once.
    if (err.status === 401 || err.status === 403) {
      return {
        status: 'denied',
        message: `Your credentials work, but ${step} is not shared with Speddy. In Aeries, check that the OneRoster box is ticked on the Speddy API Security record.`,
      };
    }
    if (err.status === 404) {
      return {
        status: 'error',
        message:
          'Your credentials work, but that address has no OneRoster data at it. Check the OneRoster URL — the token address and the data address are different.',
      };
    }
    if (err.status === 408) {
      return { status: 'error', message: 'OneRoster did not respond in time. Try again in a moment.' };
    }
    return { status: 'error', message: `OneRoster returned an unexpected error (${err.status}).` };
  }

  return {
    status: 'error',
    message:
      'Could not reach OneRoster at that address. Check the address and that it is publicly reachable.',
  };
}

async function step(
  key: OneRosterStepResult['key'],
  label: string,
  run: () => Promise<number>,
): Promise<OneRosterStepResult> {
  try {
    const count = await run();
    return { key, label, status: 'ok', message: 'Working.', count };
  } catch (err) {
    return { key, label, ...explain(err, label) };
  }
}

const NOT_REACHED = 'Not checked — the previous step has to work first.';

/**
 * Run the connection test: token grant, then orgs, then schools.
 *
 * Strictly sequential and short-circuiting. If the token grant fails, the two
 * data steps report `untested` rather than three variations of the same
 * failure — a district reading three red rows goes looking for three problems.
 */
export async function runOneRosterConnectionTest(params: {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}): Promise<OneRosterTestReport> {
  // Both URLs are re-checked here, not just at write time: a stored row could
  // predate the guard, and a name's addresses can change after it was saved.
  // Checked BEFORE the client is constructed, so no credential is ever sent to
  // an address that has not passed.
  for (const [url, what] of [
    [params.tokenUrl, 'token address'],
    [params.baseUrl, 'OneRoster address'],
  ] as const) {
    try {
      await assertSafeSisUrl(url, ONEROSTER_URL_LABELS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'That address cannot be used.';
      return {
        ok: false,
        steps: [{ key: 'token', label: 'Connection', status: 'error', message: `${what}: ${message}` }],
        summary: 'Could not connect to OneRoster.',
      };
    }
  }

  const client = new OneRosterClient(params);
  const steps: OneRosterStepResult[] = [];

  const token = await step('token', 'Sign-in', async () => {
    await client.fetchToken();
    return 1;
  });
  steps.push(token);

  if (token.status !== 'ok') {
    steps.push(
      { key: 'orgs', label: 'Districts and schools', status: 'untested', message: NOT_REACHED },
      { key: 'schools', label: 'Schools', status: 'untested', message: NOT_REACHED },
    );
    return { ok: false, steps, summary: 'Could not connect to OneRoster.' };
  }

  // One record is enough to prove the collection is readable. Walking it would
  // pull the district's whole roster to learn nothing more.
  const orgs = await step('orgs', 'Districts and schools', async () => {
    const rows = await client.getOrgs({ limit: 1 });
    return rows.length;
  });
  steps.push(orgs);

  const schools = await step('schools', 'Schools', async () => {
    const rows = await client.getSchools({ limit: 1 });
    return rows.length;
  });
  steps.push(schools);

  const failed = steps.filter((s) => s.status !== 'ok');
  const summary = failed.length === 0
    ? 'Connected. OneRoster is ready.'
    : failed.length === steps.length
      ? 'Could not connect to OneRoster.'
      : `Connected, but ${failed.length} of ${steps.length} checks need attention.`;

  return { ok: failed.length === 0, steps, summary };
}

/**
 * Reduce a report to what may be persisted in `last_test_result`.
 *
 * That column is readable by the district's own staff (SPE-395), so the counts
 * are dropped and only step names and outcomes are kept.
 */
export function toStoredOneRosterTestResult(report: OneRosterTestReport): SisTestResult {
  const failed = report.steps.filter((s) => s.status !== 'ok').map((s) => s.label);
  return {
    area: failed.length ? failed.join(', ') : 'all',
    message: report.summary,
  };
}
