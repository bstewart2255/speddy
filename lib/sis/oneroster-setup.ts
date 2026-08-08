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
    // The form Aeries documents — `https://<district>api.aeries.net/admin/token/`,
    // with the trailing slash. On ASP.NET that slash can select a different
    // route entirely. It was absent from this list, and stripped from what
    // districts typed, which is why the one address the vendor documents was
    // never dialled (SPE-432).
    //
    // LAST, and that position is load-bearing. Any candidate absorbs the
    // failures the search cannot continue past — chiefly a redirect, which
    // `redirect: 'error'` turns into a plain TypeError rather than a
    // OneRosterApiError, and which therefore ends the loop (SPE-433). A gateway
    // that canonicalises `/token/` to `/token` answers with exactly that.
    //
    // So this probe is placed where it can only ever help: after both
    // established candidates. Ahead of `/token` it would abort the search for a
    // district whose slashless endpoint works; between the two it would abort
    // it for a district relying on the `/oauth/token` fallback — a regression
    // against behaviour that already worked, to fix a district that did not.
    // Appended, it is reached only once both have failed in a continuable way,
    // which is precisely JSUSD's case.
    add(`${trimmed}/token/`);
  } catch {
    // Unparseable base: the caller's guard reports it properly.
  }
  return candidates;
}

/**
 * Normalize a token endpoint the district DID supply — which now means barely
 * touching it.
 *
 * The path is kept EXACTLY as given, trailing slash and all. This used to strip
 * the trailing slash, so that two districts typing the same endpoint differently
 * did not produce two different stored rows. That tidiness cost a live district
 * their integration (SPE-432).
 *
 * Aeries documents its OneRoster token endpoint as
 * `https://<district>api.aeries.net/admin/token/` — WITH the slash. JSUSD's tech
 * admin entered exactly that, we stripped it, and `/admin/token` answered 400
 * from some other handler while `/admin/token/` was never once dialled. Aeries
 * runs on ASP.NET, where the two can route to genuinely different endpoints.
 *
 * The rule this file keeps re-learning: when a district tells us an address,
 * believe them. Normalising away what they typed is how SPE-426 happened on the
 * Aeries side, and this is the same mistake on the OneRoster side.
 */
export function normalizeOneRosterTokenUrl(input: string): string {
  return normalizeSisUrl(
    input,
    (url) => `${url.origin}${url.pathname}`,
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
  // Whitespace only. The trailing slash is NOT stripped: `/token` and `/token/`
  // are two different addresses on the servers this has to work against, so
  // collapsing them is how we ended up never dialling the documented one
  // (SPE-432). Dedup below is exact-match for the same reason — the two
  // spellings are candidates in their own right, not duplicates.
  const storedTokenUrl = (params.tokenUrl ?? '').trim();
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

/**
 * One roster-probe finding. Same display contract as a test step — the
 * internal panel renders both through one list — but its own key space, so
 * the connection test's steps and the probe's can never collide.
 */
export interface OneRosterRosterProbeStep {
  key: 'teachers' | 'students' | 'classes' | 'rosters' | 'linkage';
  label: string;
  status: 'ok' | 'denied' | 'error' | 'untested';
  /** Plain English, numbers and fixed words only. Never a name or an ID. */
  message: string;
}

/** First page only — a probe measures presence and shape, not the district. */
const PROBE_PAGE_LIMIT = 200;
/**
 * Per-request ceiling, well under the client's 30s default. Five sequential
 * requests at the default could hold the route open for minutes on a slow
 * server; a healthy OneRoster answers these in a couple of seconds, and a
 * server that cannot answer in ten is itself a finding. Keeps the completed
 * CONNECTION verdict deliverable even when the probe crawls (CodeRabbit,
 * PR #827).
 */
const PROBE_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Measure whether a OneRoster server carries the data SPE-414 would sync:
 * teachers, classes, and enrollments joinable in BOTH directions (SPE-435).
 *
 * Read-only, first-page samples, aggregate-only messages. Runs AFTER a green
 * connection test, against the token endpoint that test resolved — it never
 * re-resolves candidates, because a probe that hunted for endpoints would turn
 * one staff click into a scatter of requests the connection test already made.
 *
 * Never throws for server-side reasons: a district whose server omits
 * `/classes` is a FINDING (labels unavailable), not an error — each check
 * degrades independently, because "which parts are missing" is exactly what
 * this probe exists to learn. The one hard refusal is the SSRF guard: both
 * URLs are checked before any request, same as every other caller (SPE-396's
 * lesson — a guard nothing calls is not a control).
 */
export async function probeOneRosterRosterData(params: {
  baseUrl: string;
  /** The token endpoint the connection test signed in at. */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}): Promise<OneRosterRosterProbeStep[]> {
  try {
    await assertSafeSisUrl(params.baseUrl, ONEROSTER_URL_LABELS);
    await assertSafeSisUrl(params.tokenUrl, ONEROSTER_URL_LABELS);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'That address cannot be used.';
    return [
      { key: 'rosters', label: 'Roster data', status: 'error', message: `Roster probe refused: ${message}` },
    ];
  }

  const client = new OneRosterClient({
    baseUrl: params.baseUrl,
    tokenUrl: params.tokenUrl,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  const steps: OneRosterRosterProbeStep[] = [];

  /**
   * Fetch one collection, folding every failure into a step. 404/405 read as
   * "this server does not provide the endpoint" — a per-collection verdict the
   * probe exists to report — while anything else reads as an error.
   */
  const sample = async <T>(
    key: OneRosterRosterProbeStep['key'],
    label: string,
    fetchPage: () => Promise<T[]>,
    describe: (rows: T[]) => { status: OneRosterRosterProbeStep['status']; message: string },
  ): Promise<T[] | null> => {
    try {
      const rows = await fetchPage();
      steps.push({ key, label, ...describe(rows) });
      return rows;
    } catch (err) {
      if (err instanceof OneRosterApiError && err.phase === 'token') {
        // The probe fetches its own token, so a token-endpoint blip surfaces
        // on every check. Without this branch it would read as the COLLECTION
        // being absent — recording "this district lacks /teachers, /students,
        // /classes and /enrollments" about endpoints that were never dialled.
        steps.push({
          key,
          label,
          status: 'error',
          message:
            'Could not sign in for this check — the sign-in that just passed stopped answering mid-probe. Run the test again.',
        });
      } else if (err instanceof OneRosterApiError && (err.status === 404 || err.status === 405)) {
        steps.push({ key, label, status: 'denied', message: 'Not provided by this server.' });
      } else {
        steps.push({
          key,
          label,
          status: 'error',
          message: 'The server did not answer this request. The connection result above is unaffected.',
        });
      }
      return null;
    }
  };

  // "In the first page", never a total: servers cap `limit` silently (the
  // client's getAllPages docstring exists because of it), so a full page at
  // ANY size may be truncation. The wording claims exactly what was seen.
  const countMessage = (n: number, noun: string): { status: 'ok' | 'denied'; message: string } =>
    n > 0
      ? { status: 'ok', message: `${n} ${noun} in the first page.` }
      : { status: 'denied', message: `The server answered, with zero ${noun}.` };

  await sample('teachers', 'Teacher directory', () => client.getTeachers({ limit: PROBE_PAGE_LIMIT, timeoutMs: PROBE_REQUEST_TIMEOUT_MS }), (rows) =>
    countMessage(rows.length, 'teachers'),
  );
  await sample('students', 'Student roster', () => client.getStudents({ limit: PROBE_PAGE_LIMIT, timeoutMs: PROBE_REQUEST_TIMEOUT_MS }), (rows) =>
    countMessage(rows.length, 'students'),
  );
  await sample('classes', 'Class records', () => client.getClasses({ limit: PROBE_PAGE_LIMIT, timeoutMs: PROBE_REQUEST_TIMEOUT_MS }), (rows) =>
    countMessage(rows.length, 'classes'),
  );

  const enrollments = await sample(
    'rosters',
    'Class rosters',
    () => client.getEnrollments({ limit: PROBE_PAGE_LIMIT, timeoutMs: PROBE_REQUEST_TIMEOUT_MS }),
    (rows) => {
      // Joinability is the whole question: a row missing either key cannot
      // connect a person to a class, whatever else it says.
      const joinable = rows.filter((r) => r.user?.sourcedId && r.class?.sourcedId);
      const students = joinable.filter((r) => r.role === 'student').length;
      const teachers = joinable.filter((r) => r.role === 'teacher').length;
      const classCount = new Set(joinable.map((r) => r.class!.sourcedId)).size;
      if (rows.length === 0) return { status: 'denied', message: 'The server answered, with zero roster entries.' };
      if (joinable.length === 0) {
        // Entries exist but none carry both IDs — a shape problem, not a role
        // problem. Reported as such so the SPE-414 investigation starts at the
        // ID nesting, not at roles that were never the issue.
        return {
          status: 'denied',
          message: `${rows.length} entries in the first page, but none carry joinable user and class IDs.`,
        };
      }
      if (teachers === 0) {
        return {
          status: 'denied',
          message: `${students} student entries but NO teacher entries in the first page — students cannot be joined to teachers from this data.`,
        };
      }
      if (students === 0) {
        return {
          status: 'denied',
          message: `${teachers} teacher entries but NO student entries in the first page — students cannot be joined to teachers from this data.`,
        };
      }
      return {
        status: 'ok',
        message: `${students} student and ${teachers} teacher entries across ${classCount} classes in the first page.`,
      };
    },
  );

  // Teachers-per-student, from the same sample: student → their classes →
  // every teacher-role entry sharing a class. First-page arithmetic, so it can
  // undercount a student whose classes fall outside the page — stated in the
  // message rather than silently presented as the whole truth.
  {
    const key = 'linkage' as const;
    const label = 'Teachers per student';
    if (enrollments === null) {
      // A statement about a sample requires a sample. Without this branch the
      // step would assert "no student shares a class with a teacher" about
      // enrollments that were never fetched.
      steps.push({
        key,
        label,
        status: 'untested',
        message: 'Not measured — the class-roster request did not answer.',
      });
    } else {
      const joinable = enrollments.filter((r) => r.user?.sourcedId && r.class?.sourcedId);
      const teachersByClass = new Map<string, Set<string>>();
      for (const row of joinable) {
        if (row.role !== 'teacher') continue;
        const classId = row.class!.sourcedId;
        if (!teachersByClass.has(classId)) teachersByClass.set(classId, new Set());
        teachersByClass.get(classId)!.add(row.user!.sourcedId);
      }
      const teachersByStudent = new Map<string, Set<string>>();
      for (const row of joinable) {
        if (row.role !== 'student') continue;
        const studentId = row.user!.sourcedId;
        if (!teachersByStudent.has(studentId)) teachersByStudent.set(studentId, new Set());
        for (const teacher of teachersByClass.get(row.class!.sourcedId) ?? []) {
          teachersByStudent.get(studentId)!.add(teacher);
        }
      }
      // Zeroes stay in. A student with no reachable teacher is the finding
      // SPE-414 most needs to know the rate of — dropping them would let a
      // sample where joining mostly FAILS read as one where it worked.
      const counts = [...teachersByStudent.values()].map((set) => set.size);
      const unlinked = counts.filter((n) => n === 0).length;
      if (counts.length === 0 || counts.every((n) => n === 0)) {
        steps.push({
          key,
          label,
          status: 'untested',
          message: 'Not computable — no student in the sample shares a class with a teacher entry.',
        });
      } else {
        counts.sort((a, b) => a - b);
        const min = counts[0];
        const max = counts[counts.length - 1];
        // True median: even-length samples average the two middle values. The
        // lower-middle shortcut reported [1, 1, 5, 5] as "typical 1" — a
        // systematic understatement in the one number the elementary-vs-
        // secondary default gets decided on (Codex, PR #827).
        const mid =
          (counts[Math.floor((counts.length - 1) / 2)] + counts[Math.ceil((counts.length - 1) / 2)]) / 2;
        const median = Number.isInteger(mid) ? mid : mid.toFixed(1);
        const gap = unlinked > 0 ? ` ${unlinked} of them had NO teacher entry.` : '';
        steps.push({
          key,
          label,
          status: 'ok',
          message: `Sampled ${counts.length} students: fewest ${min}, typical ${median}, most ${max} teachers each (first-page sample).${gap}`,
        });
      }
    }
  }

  return steps;
}
