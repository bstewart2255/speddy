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
 * Token endpoints to try when the district did not give us one, in order.
 *
 * Districts are asked for a "token address" their admin console never shows
 * them. An Aeries OneRoster screen presents a URL, a consumer ID and a secret —
 * no token endpoint — so the field could only ever be answered with a guess
 * (SPE-426: a live district guessed, and their guess went untested for hours).
 * Deriving it is strictly better than demanding it: the shapes below are the
 * ones vendors actually serve, and the connection test settles which is right
 * rather than asking someone to know.
 *
 * Always UNDER the base URL the district supplied — these append to their path,
 * they never climb out of it. An earlier cut also tried `<origin>/token`, and
 * that is a different thing entirely: a district whose OneRoster lives at
 * `https://sis.example.org/aeries` shares that host with other applications,
 * and posting their consumer secret to `https://sis.example.org/token` would
 * hand it to whatever answers at the root. Staying under the path they gave us
 * keeps every guess inside the application they pointed us at.
 */
export function oneRosterTokenUrlCandidates(baseUrl: string): string[] {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const candidates: string[] = [];
  const add = (value: string) => {
    if (!candidates.includes(value)) candidates.push(value);
  };

  try {
    // Parsed for validation only — an unparseable base has no safe guesses.
    new URL(trimmed);
    add(`${trimmed}/token`);
    add(`${trimmed}/oauth/token`);
  } catch {
    // Unparseable base: the caller's guard reports it properly.
  }
  return candidates;
}

/**
 * Normalize a token endpoint the district DID supply.
 *
 * Kept whole — unlike the base URL there is no version segment to strip, and
 * the path genuinely varies between vendors (`/token`, `/token/`, `/oauth/token`).
 * Only the trailing slash is normalized, so two districts who typed the same
 * endpoint differently don't produce two different stored rows.
 */
export function normalizeOneRosterTokenUrl(input: string): string {
  return normalizeSisUrl(
    input,
    (url) => `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
    'OneRoster token address',
  );
}

/**
 * Shared parse/guard/https path for both URLs, so neither can skip a check.
 *
 * `what` names the FIELD, not the product. This flow has two URLs and the
 * message goes straight to the district: telling someone whose token address is
 * blank to "enter your OneRoster address" sends them to correct the field that
 * is already right.
 */
function normalizeSisUrl(
  input: string,
  shape: (url: URL) => string,
  what = 'OneRoster address',
): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error(`Enter your ${what}.`);

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
    throw new Error(`The ${what} must start with https:// so credentials stay encrypted.`);
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
  /**
   * The token endpoint that actually answered, when it differs from the stored
   * one.
   *
   * REPORTING ONLY — deliberately not written back to the connection row, for
   * the same reason as `AeriesTestReport.usedBaseUrl`: resolution runs on
   * failures too, so persisting it would let a bad minute overwrite a working
   * district's configuration with an endpoint that never worked.
   *
   * Never a credential — a URL under the base the district already gave us.
   */
  usedTokenUrl?: string;
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
      // NESTED inside the credential-status check on purpose. An OAuth error
      // object is only meaningful on the statuses a token endpoint uses to
      // report one; at the top level this branch also caught 404/405/5xx, so a
      // candidate that 404'd with `{"error":"invalid_scope"}` in its body would
      // claim "nothing for you to change" and then override the correct "no
      // sign-in endpoint answered under your OneRoster address" advice.
      // Same conclusion as a 404, reached by a different route: nothing here
      // looks like a sign-in endpoint. Only ever surfaces when EVERY candidate
      // failed, because a bare 400 no longer stops the search.
      if (err.status === 400 && !err.oauthError) {
        // Placeholder: neither a 404 nor a bare 400 stops the search, so this
        // is always replaced by `noTokenEndpointMessage` once the candidates
        // are exhausted and we know what was actually dialled.
        return { status: 'error', message: noTokenEndpointMessage('', []) };
      }
      if (err.status === 401 || err.status === 400) {
        // OUR fault, not theirs. Every code here describes the REQUEST: it was
        // malformed, asked for a scope they do not offer, or used a grant type
        // they do not support. In each case the endpoint objected before it
        // ever evaluated the credentials. Telling a district to re-enter
        // correct credentials because of our own bad request is the exact
        // misdiagnosis this area keeps producing (SPE-419), and a 400 alone
        // cannot tell it apart from a real credential failure.
        if (err.oauthError && REQUEST_SHAPE_ERRORS.has(err.oauthError)) {
          return {
            status: 'error',
            message:
              'Your OneRoster refused the way Speddy asked for access, not your credentials. Nothing for you to change — this is ours to fix, and we can see it.',
          };
        }
        return {
          status: 'error',
          message:
            'Those credentials were rejected. OneRoster uses the Consumer ID and Consumer Secret Key — not the certificate. Both are on Security → API Security → "Display Consumer ID & Secret Keys".',
        };
      }
      if (err.status === 404) {
        // Reached only after every candidate under the district's OneRoster
        // address has 404'd too, so "check the token address" is the wrong
        // advice — it is the field we now tell them to leave blank. The address
        // still worth checking is the one they DID give us.
        // Placeholder: neither a 404 nor a bare 400 stops the search, so this
        // is always replaced by `noTokenEndpointMessage` once the candidates
        // are exhausted and we know what was actually dialled.
        return { status: 'error', message: noTokenEndpointMessage('', []) };
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
  /** What an empty result means, when empty is not a success. */
  emptyMeans?: string,
): Promise<OneRosterStepResult> {
  try {
    const count = await run();
    if (emptyMeans && count === 0) {
      // Raised by CodeRabbit, and it is right: a 200 with `{"orgs": []}` was
      // reporting "Connected. OneRoster is ready." A district's OneRoster
      // always exposes at least the district org, so nothing coming back does
      // not mean "no data yet" — it means nothing is shared with us, and the
      // district would discover that only when no data ever arrived.
      //
      // 'denied' rather than 'error': the connection genuinely works. What is
      // missing is a sharing setting, which is a different thing to go fix.
      return { key, label, status: 'denied', message: emptyMeans, count };
    }
    return { key, label, status: 'ok', message: 'Working.', count };
  } catch (err) {
    return { key, label, ...explain(err, label) };
  }
}

const NOT_REACHED = 'Not checked — the previous step has to work first.';

/**
 * RFC 6749 error codes that mean OUR request was wrong, not their credentials.
 *
 * `invalid_request` belongs here and is easy to miss — RFC 6749 §5.2 defines it
 * as "the request is missing a required parameter, includes an unsupported
 * parameter value, repeats a parameter, or is otherwise malformed". Every one
 * of those is something we did. A token endpoint that does not implement the
 * `scope` parameter we always send commonly answers `invalid_request` rather
 * than `invalid_scope`, so omitting it would leave the single likeliest
 * our-fault case still blaming the district.
 */
const REQUEST_SHAPE_ERRORS = new Set([
  'invalid_request',
  'invalid_scope',
  'unsupported_grant_type',
]);

/**
 * Said when nothing we dialled behaved like a sign-in endpoint.
 *
 * Two shapes, because one sentence cannot be true for both. "Enter a token
 * address above" is a false statement to a district whose field is already
 * filled in and whose address was one of the ones that just answered — which is
 * exactly JSUSD's situation. So when they supplied one, say so; and either way
 * name what was actually tried rather than leaving them to guess at it.
 *
 * Reached only from the report level, once the candidates are exhausted: it
 * needs to know what was dialled, which `explain` cannot see from one error.
 */
function noTokenEndpointMessage(storedTokenUrl: string, dialled: string[]): string {
  const tried = dialled.length ? ` We tried ${dialled.join(' and ')}.` : '';
  return storedTokenUrl
    ? `Nothing at your token address behaved like a OneRoster sign-in endpoint.${tried} Check both addresses against your OneRoster settings — the sign-in address is often not the one the data lives at.`
    : `No sign-in endpoint answered under your OneRoster address.${tried} Check that address first; if your OneRoster settings do show a separate token address, enter it above.`;
}

/**
 * Whether a token-step failure means "no token endpoint here" (keep looking)
 * or "this IS the endpoint" (stop).
 *
 * Deliberately wider than a bare 404, and deliberately narrower than "any
 * failure". Each status earns its place:
 *
 *   404 — nothing served at that path.
 *   405 — something is there, but it does not take a POST. Not a token
 *         endpoint; a vendor's data path answers exactly like this.
 *   `unusableTokenResponse` — the endpoint answered 2xx but the body was not
 *         JSON, or carried no `access_token`. A login page or a data collection
 *         returning 200 is a wrong endpoint wearing a success status.
 *
 * That last one is a FLAG, not a status, and the distinction is the point.
 * `fetchToken` raises those two cases with a synthetic 502, and `dial` raises a
 * real upstream 502 with the same number — but they mean opposite things. A
 * gateway 502 says the token endpoint exists and is broken; posting the
 * district's consumer secret to two more paths would neither find it nor say
 * anything useful. Keying on the status alone conflated them (caught in review).
 *
 * And one more that the body explains in full: a 400 naming NO reason at all,
 * which RFC 6749 §5.2 says a real token endpoint must never send.
 *
 * What must NOT continue: 401, 403, and a 400 that DOES name a credential
 * problem — the endpoint telling us the CREDENTIALS are wrong, which is the
 * district's real problem, and walking on would replace it with "check your
 * address" and hide it. Nor any real 5xx.
 *
 * Every extra candidate posts the consumer secret somewhere new, so the set
 * stays as small as the failure modes allow.
 */
function isNotATokenEndpoint(err: unknown): boolean {
  if (!(err instanceof OneRosterApiError) || err.phase !== 'token') return false;
  if (err.unusableTokenResponse || err.status === 404 || err.status === 405) return true;

  // A 400 that names no reason. RFC 6749 §5.2 REQUIRES a token endpoint to
  // return an error code in the body when it refuses — `invalid_client`,
  // `invalid_scope`, and so on. A bare 400 is therefore evidence that whatever
  // answered is not a token endpoint at all, rather than a token endpoint
  // refusing a credential.
  //
  // Learned from a live district (SPE-431). Their guessed `<base>/token`
  // answered 400 with no code, we read that as "your credentials were
  // rejected", and we stopped — so we never tried `<base>/oauth/token` and may
  // never have found their real sign-in endpoint at all. That is the SPE-426
  // failure exactly, one connector over: assume an address, stop early, blame
  // the district for it.
  //
  // Deliberately NOT extended to 401. A 401 is a strong authentication verdict
  // from any server, compliant or not, and treating it as "wrong address" would
  // walk past a genuine credential failure — the misdiagnosis running the other
  // way, which is the one this module was built to prevent.
  return err.status === 400 && !err.oauthError;
}

/**
 * Run the connection test: token grant, then orgs, then schools.
 *
 * Strictly sequential and short-circuiting. If the token grant fails, the two
 * data steps report `untested` rather than three variations of the same
 * failure — a district reading three red rows goes looking for three problems.
 */
export async function runOneRosterConnectionTest(params: {
  baseUrl: string;
  /** Optional: blank means "we were never told one", and it gets derived. */
  tokenUrl?: string;
  clientId: string;
  clientSecret: string;
}): Promise<OneRosterTestReport> {
  // The BASE URL is checked up front, before any client exists: every token
  // candidate is derived from it, so if it cannot be used there is nothing safe
  // to try. Re-checked here rather than trusted from write time, because a
  // stored row can predate the guard and a name's addresses can change.
  try {
    await assertSafeSisUrl(params.baseUrl, ONEROSTER_URL_LABELS);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'That address cannot be used.';
    return {
      ok: false,
      steps: [
        { key: 'token', label: 'Connection', status: 'error', message: `OneRoster address: ${message}` },
      ],
      summary: 'Could not connect to OneRoster.',
    };
  }

  // The TOKEN address is deliberately NOT checked here. It is guarded per
  // candidate inside the loop below, which is the only place it can be: a
  // stored token address the guard refuses is exactly the case resolution
  // exists for, and failing here would return before the derived candidates
  // were ever tried — leaving the district stuck on a guess they were asked to
  // make and cannot correct. Nothing is sent to any candidate that has not
  // passed; the guard simply runs later, per address.

  const steps: OneRosterStepResult[] = [];

  // Sign in, resolving the token endpoint if the stored one is not there.
  //
  // Same discriminator as the Aeries resolver: a 404 means nothing serves that
  // path, so keep looking. A 401 means the endpoint EXISTS and rejected the
  // credentials — the district's real problem — so stop, or we would report a
  // credential error as an address error. On the happy path this is exactly one
  // request, because the stored value is tried first.
  //
  // Trimmed, so a stored value that differs only by a trailing slash is not
  // tried twice and does not later read as "we found a different endpoint".
  const storedTokenUrl = (params.tokenUrl ?? '').trim().replace(/\/+$/, '');
  const tokenCandidates = [
    ...(storedTokenUrl ? [storedTokenUrl] : []),
    ...oneRosterTokenUrlCandidates(params.baseUrl).filter((u) => u !== storedTokenUrl),
  ];

  let client!: OneRosterClient;
  let resolvedTokenUrl = storedTokenUrl;
  let token!: OneRosterStepResult;
  let tokenFallback:
    | { client: OneRosterClient; step: OneRosterStepResult; url: string }
    | null = null;
  // Kept so a candidate list the guard refused outright reports WHY, rather
  // than a generic "cannot be used" the district can do nothing with.
  let guardRefusal: string | null = null;
  // Every address actually dialled, in order. Reported when none of them turn
  // out to be a sign-in endpoint, because "check your token address" is not
  // advice a district can act on without knowing what we already tried.
  const dialled: string[] = [];

  for (const candidate of tokenCandidates) {
    // Re-guarded per candidate: a credential is about to be posted to it.
    try {
      await assertSafeSisUrl(candidate, ONEROSTER_URL_LABELS);
    } catch (err) {
      guardRefusal ??= err instanceof Error ? err.message : null;
      continue;
    }

    dialled.push(candidate);
    const attemptClient = new OneRosterClient({ ...params, tokenUrl: candidate });
    let missing = false;
    const attempt = await step('token', 'Sign-in', async () => {
      try {
        await attemptClient.fetchToken();
        return 1;
      } catch (err) {
        missing = isNotATokenEndpoint(err);
        throw err;
      }
    });

    if (missing) {
      tokenFallback ??= { client: attemptClient, step: attempt, url: candidate };
      continue;
    }

    client = attemptClient;
    resolvedTokenUrl = candidate;
    token = attempt;
    break;
  }

  // Nothing served a token endpoint. Report the FIRST candidate's own failure —
  // naming the last guess we also could not reach would bury the truth.
  if (!token && tokenFallback) {
    client = tokenFallback.client;
    token = tokenFallback.step;
    // The address we actually dialled, not the stored one. When the district
    // left the field blank there IS no stored address, and reporting a failure
    // against an empty string tells them nothing about what was tried.
    resolvedTokenUrl = tokenFallback.url;
    // Nothing that answered behaved like a sign-in endpoint, so the conclusion
    // is a report-level one and only now can it be worded truthfully — it needs
    // to know whether the district supplied a token address, and which
    // addresses were tried. Telling someone to "enter a token address above"
    // when theirs is already filled in, and was one of the ones that just
    // answered, is a false statement dressed as advice.
    token = { ...token, message: noTokenEndpointMessage(storedTokenUrl, dialled) };
  }
  if (!token) {
    return {
      ok: false,
      steps: [
        {
          key: 'token',
          label: 'Connection',
          status: 'error',
          message: guardRefusal ?? 'That address cannot be used.',
        },
      ],
      summary: 'Could not connect to OneRoster.',
    };
  }

  const usedTokenUrl = resolvedTokenUrl !== storedTokenUrl ? resolvedTokenUrl : undefined;
  if (usedTokenUrl) {
    // Named whether it worked or not, and most of all when it did NOT. A
    // district who left the field blank and is then told their Consumer ID and
    // Secret are wrong has no way to know we picked an address for them — which
    // is the same dead end, one field over, that this ticket exists to remove.
    token =
      token.status === 'ok'
        ? { ...token, message: `Working — signed in at ${usedTokenUrl}.` }
        : { ...token, message: `${token.message} (Tried ${usedTokenUrl}.)` };
  }
  steps.push(token);

  if (token.status !== 'ok') {
    steps.push(
      { key: 'orgs', label: 'Districts and schools', status: 'untested', message: NOT_REACHED },
      { key: 'schools', label: 'Schools', status: 'untested', message: NOT_REACHED },
    );
    return { ok: false, steps, summary: 'Could not connect to OneRoster.', usedTokenUrl };
  }

  // One record is enough to prove the collection is readable. Walking it would
  // pull the district's whole roster to learn nothing more.
  const orgs = await step(
    'orgs',
    'Districts and schools',
    async () => {
      const rows = await client.getOrgs({ limit: 1 });
      return rows.length;
    },
    'Connected, but nothing is shared with Speddy yet. In Aeries, check that OneRoster is enabled under District-level School Options → OneRoster Settings.',
  );
  steps.push(orgs);

  const schools = await step(
    'schools',
    'Schools',
    async () => {
      const rows = await client.getSchools({ limit: 1 });
      return rows.length;
    },
    'Connected, but no schools came back. Check that your schools are included in the OneRoster settings in Aeries.',
  );
  steps.push(schools);

  const failed = steps.filter((s) => s.status !== 'ok');
  const summary = failed.length === 0
    ? 'Connected. OneRoster is ready.'
    : failed.length === steps.length
      ? 'Could not connect to OneRoster.'
      : `Connected, but ${failed.length} of ${steps.length} checks need attention.`;

  return { ok: failed.length === 0, steps, summary, usedTokenUrl };
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
