/**
 * Aeries connection setup: URL normalization and per-area diagnostics (SPE-396).
 *
 * The persona this exists for is a district generalist who has Aeries admin
 * rights but has never opened the API Security page. Everything here is built
 * around one goal: when their connection doesn't work, tell them exactly which
 * checkbox to fix, in words they can act on — instead of an HTTP status they
 * have to forward to us.
 *
 * TWO RULES THAT SHAPE THIS FILE
 *
 * 1. Aggregate-only. The tech admin has NO right to student data (SPE-393 —
 *    the role sees integrations and nothing else). Every probe therefore
 *    reports a COUNT and an area name, never a record. `fields` is pinned to a
 *    single non-identifying column and pagination to one row wherever the API
 *    allows it, so we don't even pull PII into memory to count it.
 *
 * 2. Never echo the certificate. Aeries error bodies can contain the submitted
 *    cert; `AeriesClient` already discards bodies and keeps status + path, and
 *    nothing here re-introduces them.
 *
 * Server-only: reaches an external SIS with a decrypted credential.
 */
import { AeriesApiError, AeriesClient } from '@/lib/integrations/aeries';
import { AERIES_URL_LABELS, assertPublicSisHostSyntax, assertSafeSisUrl } from './ssrf-guard';
import type { SisTestResult } from './connections';

export const AERIES_API_PATH = '/aeries/api/v5';

/**
 * The API roots we know Aeries serves, in the order we try them.
 *
 * The API lives under the Aeries APPLICATION ROOT, and that root varies by
 * deployment — which is the whole reason this is a list rather than a constant.
 * Aeries' own documentation uses `demo.aeries.net/aeries/api/v5`, where
 * `/aeries` is the app root.
 *
 *   - `/aeries/api/v5`  — the documented default, and what this integration was
 *                         originally built and tested against.
 *   - `/api/v5`         — no app prefix at all.
 *   - `/admin/api/v5`   — an app root of `/admin`.
 *
 * Assuming the first cost a live district a morning (SPE-426): their server
 * answered every probe with 404, and because `normalizeAeriesBaseUrl` replaced
 * whatever they typed, there was no address they could have entered to fix it.
 *
 * `/admin/api/v5` was added after the first two BOTH 404'd for that district
 * (SPE-429), on evidence rather than another guess: the same district gave us
 * `https://<host>/admin` as their OneRoster address, so `/admin` is their app
 * root and their Aeries API should sit under it. Their OneRoster row is the
 * only place they ever told us, because the Aeries field discards the path.
 *
 * Order is deliberate — the documented default stays first, so a district that
 * already works still makes exactly one request. Only a district whose stored
 * address is wrong pays for the extra candidates, and only on the way to an
 * answer it could not otherwise get.
 */
export const AERIES_API_PATHS = [AERIES_API_PATH, '/api/v5', '/admin/api/v5'] as const;

/**
 * Every base URL worth trying for a district, most-likely first.
 *
 * The stored value leads: if a district (or a previous resolution) gave us a
 * specific path, it is tried before anything we would guess. The known layouts
 * follow, on the same host — only the PATH ever varies, so this widens no
 * egress beyond the host the district supplied and the guard already cleared.
 */
export function aeriesBaseUrlCandidates(storedBaseUrl: string): string[] {
  const trimmed = storedBaseUrl.trim().replace(/\/+$/, '');
  const candidates: string[] = [];
  const add = (value: string) => {
    if (!candidates.includes(value)) candidates.push(value);
  };

  add(trimmed);
  try {
    const { origin } = new URL(trimmed);
    for (const path of AERIES_API_PATHS) add(`${origin}${path}`);
  } catch {
    // Unparseable stored value: the caller's SSRF check will reject it and
    // report properly. Nothing to add.
  }
  return candidates;
}

/**
 * Whether a failure means "wrong address" (keep looking) or "right address"
 * (stop).
 *
 * This is the load-bearing distinction in the whole resolver. A 404 is the only
 * status that says the endpoint is not there. A 401 means the server HAS that
 * endpoint and refused the certificate; a 403 means it has it and a permission
 * box is unticked. Treating either as "keep looking" would walk past the
 * correct address and then report a credential problem as an address problem —
 * the same class of misdiagnosis as SPE-417, which is what this ticket exists
 * to stop repeating.
 *
 * The caller adds one more case the status code cannot express: a 200 whose
 * body is not a list of schools. See the probe below.
 */
function isWrongAddress(err: unknown): boolean {
  if (err instanceof AeriesApiError) return err.status === 404;

  // A 200 whose body will not parse as JSON at all. `AeriesClient` calls
  // `res.json()` and lets the parse error through raw, so this arrives as a
  // SyntaxError with no status attached — and without this it falls into
  // `explain`'s network branch, telling a district we "could not reach" a host
  // that answered perfectly well.
  //
  // This is the ordinary shape of a wrong path on a district's own web server:
  // an HTML login page, an error page, or whatever a redirect landed on. Not a
  // rare case, and a 404-only check misses all of it.
  //
  // Matched on SHAPE, not `instanceof`. The parse error is raised inside the
  // fetch implementation's own realm, so `err instanceof SyntaxError` — and
  // even `err instanceof Error` — is false. The first version of this check
  // used `instanceof` and therefore never fired once against a real HTML body.
  const e = err as { name?: unknown; message?: unknown } | null | undefined;
  const name = typeof e?.name === 'string' ? e.name : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  return name === 'SyntaxError' || /JSON/i.test(message);
}

/**
 * Turn whatever a district administrator pasted into the base URL the client
 * needs.
 *
 * They will paste what they see in their browser. Observed and handled:
 *   https://demo.aeries.net                      (bare host)
 *   https://demo.aeries.net/                     (trailing slash)
 *   https://demo.aeries.net/admin                (the admin UI they were just in)
 *   https://demo.aeries.net/aeries/api/v5        (already correct)
 *   demo.aeries.net                              (no scheme at all)
 *
 * Rejecting these instead would produce a support ticket for a typo, which is
 * exactly the back-and-forth this ticket exists to remove.
 *
 * @throws with an actionable message when the input cannot be a URL at all.
 */
export function normalizeAeriesBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter your district's Aeries web address.");

  // A pasted host with no scheme is the single most common shape; assume https
  // rather than failing. Aeries is HTTPS-only in practice.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(
      `"${trimmed}" doesn't look like a web address. It should look like https://yourdistrict.aeries.net`,
    );
  }

  if (url.protocol !== 'https:') {
    // An http:// base would put the certificate on the wire in cleartext on
    // every request. Refuse rather than silently upgrading, so the district
    // fixes the address they actually gave us.
    throw new Error('The Aeries address must start with https:// so credentials stay encrypted.');
  }

  // Refuse anything that could point our server at a private network. This is
  // the syntactic half; assertPublicSisHost() resolves the name too, and is
  // what the store and test paths actually await.
  assertPublicSisHostSyntax(url.hostname, AERIES_URL_LABELS);

  // An explicit API root is KEPT. Overriding it is what left a district unable
  // to enter a working address at all (SPE-426): their API lives at `/api/v5`,
  // and pasting exactly that still produced `/aeries/api/v5`. If they have told
  // us where their API is, believe them — the connection test will find out
  // soon enough, and it can try the other layouts if this one 404s.
  const path = url.pathname.replace(/\/+$/, '');
  if (/\/api\/v\d+$/i.test(path)) return `${url.origin}${path}`;

  // Otherwise strip whatever page they landed on and apply the default root.
  // /admin, /student, a deep link — none of it is the API root, and guessing
  // from their path is how you end up with .../admin/aeries/api/v5.
  return `${url.origin}${AERIES_API_PATH}`;
}

/** One probed permission area, in the district's terms — not Aeries' URLs. */
export interface AeriesAreaResult {
  /** Stable key for the UI. */
  key: 'connection' | 'schools' | 'students' | 'teachers' | 'programs';
  /** The label as it appears on the Aeries API Security page. */
  label: string;
  status: 'ok' | 'denied' | 'error' | 'untested';
  /** Plain-English outcome. Never contains a name, an ID, or the certificate. */
  message: string;
  /** Aggregate only — how many records the area returned, when it succeeded. */
  count?: number;
}

export interface AeriesTestReport {
  ok: boolean;
  areas: AeriesAreaResult[];
  /** One-line summary for the connection row and the status chip. */
  summary: string;
  /**
   * The base URL that actually answered, when it differs from the one stored.
   *
   * REPORTING ONLY — deliberately not written back to the connection row.
   * An earlier cut of SPE-426 persisted this, and the review found the trap it
   * sets: resolution runs on failures too, so a district whose correct address
   * had a bad minute could have had it overwritten with one that never worked,
   * and the replacement's 401/403 would then stop resolution from ever moving
   * off it again. One extra request per test is a trivial price next to
   * silently rewriting a working district's configuration.
   *
   * Never contains a credential; it is a URL on the host the district gave us.
   */
  usedBaseUrl?: string;
}

/**
 * Map an Aeries failure to something the district can act on.
 *
 * The mapping that matters most is 401 vs 403. Aeries returns 401 when the
 * certificate itself is wrong and 403 when the certificate is valid but that
 * permission box was never checked — completely different fixes, and telling
 * them apart is most of this feature's value.
 */
function explain(err: unknown, area: string): { status: 'denied' | 'error'; message: string } {
  if (err instanceof AeriesApiError) {
    if (err.status === 401) {
      return {
        status: 'error',
        message:
          'Aeries rejected the certificate. Re-copy it from Security → API Security → Display Certificate Details.',
      };
    }
    if (err.status === 403) {
      return {
        status: 'denied',
        message: `Not granted. In Aeries, tick the read-only box for "${area}" on the Speddy API Security record.`,
      };
    }
    if (err.status === 404) {
      return {
        status: 'error',
        message:
          'Not found at that address. Check the Aeries web address — it should look like https://yourdistrict.aeries.net',
      };
    }
    if (err.status === 408) {
      return { status: 'error', message: 'Aeries did not respond in time. Try again in a moment.' };
    }
    return { status: 'error', message: `Aeries returned an unexpected error (${err.status}).` };
  }
  // Answered, but not with Aeries API data — a login or error page where the
  // API should be. Reported separately from a network failure because the fixes
  // are opposite: this host is reachable, the address is wrong.
  if (isWrongAddress(err)) {
    return {
      status: 'error',
      message:
        'That address answered, but not with Aeries data. Check the Aeries web address — it should look like https://yourdistrict.aeries.net',
    };
  }
  // Network-level: DNS, TLS, refused connection. No status to report.
  return {
    status: 'error',
    message: 'Could not reach Aeries at that address. Check the web address and that it is publicly reachable.',
  };
}

/** Probe one area, converting any failure into a reportable result. */
async function probe(
  key: AeriesAreaResult['key'],
  label: string,
  run: () => Promise<number>,
): Promise<AeriesAreaResult> {
  try {
    const count = await run();
    return { key, label, status: 'ok', message: 'Granted.', count };
  } catch (err) {
    return { key, label, ...explain(err, label) };
  }
}

/**
 * Run the full connection test and report per area.
 *
 * Ordering is deliberate: connection and Schools first, because everything
 * downstream needs a school code, and because "we can't reach you at all" and
 * "one checkbox is missing" should never be reported as the same failure. If
 * Schools fails there is nothing to probe the other areas against, so they are
 * reported as untested rather than guessed at.
 */
export async function runAeriesConnectionTest(params: {
  baseUrl: string;
  certificate: string;
}): Promise<AeriesTestReport> {
  // Re-checked here, not just at write time: the stored row could predate the
  // guard, and a name's addresses can change after it was saved.
  try {
    await assertSafeSisUrl(params.baseUrl, AERIES_URL_LABELS);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'That address cannot be used.';
    return {
      ok: false,
      areas: [{ key: 'connection', label: 'Connection', status: 'error', message }],
      summary: 'Could not connect to Aeries.',
    };
  }

  const areas: AeriesAreaResult[] = [];

  // 1. Reachability + certificate, across the known API layouts. `schools`
  // doubles as the auth check: it is the smallest endpoint that requires a
  // valid cert, and it carries no student data, so a failed connection never
  // touches PII. It is also what resolution is decided on — a 404 here is the
  // signal that the address, not the credential, is wrong.
  //
  // On the happy path this is exactly one request, as before: the stored base
  // is tried first and anything other than a 404 ends the search.
  let schoolCodes: number[] = [];
  let client!: AeriesClient;
  let schools!: AeriesAreaResult;

  // Compared against the TRIMMED stored value, so a trailing slash alone never
  // reads as "we found a different address".
  const storedBaseUrl = params.baseUrl.trim().replace(/\/+$/, '');
  let resolvedBaseUrl = storedBaseUrl;

  // The stored value's own verdict, kept in case nothing answers. Without it,
  // exhausting every candidate would report against whichever layout happened
  // to be tried last, blaming an address that is just as wrong as the one we
  // started with.
  let exhaustedFallback: { client: AeriesClient; schools: AeriesAreaResult } | null = null;
  // Kept so a candidate list the guard refused outright reports WHY — the
  // resolved-to-a-private-address or unreachable-name reason — instead of a
  // bare "cannot be used" the district can do nothing with.
  let guardRefusal: string | null = null;

  const candidates = aeriesBaseUrlCandidates(params.baseUrl);
  for (const candidate of candidates) {
    // Each candidate is re-guarded. Only the path varies, but the check is
    // cheap and skipping it on the strength of "same host" is how a guard
    // quietly stops covering one of its call sites.
    try {
      await assertSafeSisUrl(candidate, AERIES_URL_LABELS);
    } catch (err) {
      guardRefusal ??= err instanceof Error ? err.message : null;
      continue;
    }

    const attemptClient = new AeriesClient({
      baseUrl: candidate,
      certificate: params.certificate,
    });
    let wrongAddress = false;
    const attempt = await probe('schools', 'Schools', async () => {
      try {
        const list = await attemptClient.getSchools({ fields: ['SchoolCode', 'Name'] });
        if (!Array.isArray(list)) {
          // Two things at once. Without the throw, `.map` raises a TypeError
          // that `explain` reads as a network failure — telling a district
          // their reachable instance is unreachable. And a 200 carrying
          // something that is not a list of schools is what a district's *web*
          // server returns for a path its API does not serve: a login page, an
          // error page, the landing page a redirect ended on. That is the same
          // "wrong address" as a 404, wearing a 200, so keep looking.
          wrongAddress = true;
          throw new AeriesApiError(
            'Aeries returned an unexpected response for Schools.',
            502,
            'schools',
          );
        }
        schoolCodes = list.map((s) => s.SchoolCode).filter((c) => Number.isFinite(c));
        return list.length;
      } catch (err) {
        wrongAddress ||= isWrongAddress(err);
        throw err;
      }
    });

    // Keep looking only while the server says "not here". Anything else — a
    // success, a rejected certificate, an unticked permission, a timeout — is
    // an answer FROM this address, so it is the address to report against.
    if (wrongAddress) {
      exhaustedFallback ??= { client: attemptClient, schools: attempt };
      schoolCodes = [];
      continue;
    }

    client = attemptClient;
    resolvedBaseUrl = candidate;
    schools = attempt;
    break;
  }

  // Nothing answered. Report the stored address's own 404: "we could not find
  // your API at any layout we know" is the truth, and naming a guess we also
  // failed to reach would bury it.
  if (!schools && exhaustedFallback) {
    client = exhaustedFallback.client;
    schools = exhaustedFallback.schools;
    resolvedBaseUrl = storedBaseUrl;
  }

  // Every candidate was refused by the guard: nothing was dialled at all.
  if (!schools) {
    return {
      ok: false,
      areas: [
        {
          key: 'connection',
          label: 'Connection',
          status: 'error',
          message: guardRefusal ?? 'That address cannot be used.',
        },
      ],
      summary: 'Could not connect to Aeries.',
    };
  }

  const usedBaseUrl = resolvedBaseUrl !== storedBaseUrl ? resolvedBaseUrl : undefined;
  areas.push(
    schools.status === 'ok'
      ? {
          key: 'connection',
          label: 'Connection',
          status: 'ok',
          // Named when it is not the address they typed, so a district can see
          // what worked instead of being told everything is fine about a value
          // they cannot find anywhere in their own settings.
          message: usedBaseUrl
            ? `Speddy can reach your Aeries instance at ${usedBaseUrl}.`
            : 'Speddy can reach your Aeries instance.',
        }
      : { key: 'connection', label: 'Connection', status: schools.status, message: schools.message },
    schools,
  );

  if (schools.status !== 'ok' || schoolCodes.length === 0) {
    // 'untested', not 'error': these areas were never probed, and rendering
    // three red permission failures for checkboxes we never looked at sends the
    // district to fix things that may be perfectly fine.
    const blocked: AeriesAreaResult['status'] = 'untested';
    const why =
      schools.status === 'ok'
        ? 'No schools were returned, so the remaining areas could not be checked.'
        : 'Not checked — the connection has to work first.';
    for (const [key, label] of [
      ['students', 'Student Data'],
      ['teachers', 'Teacher/Staff Data'],
      ['programs', 'Student Programs'],
    ] as const) {
      areas.push({ key, label, status: blocked, message: why });
    }
    return {
      ok: false,
      areas,
      usedBaseUrl,
      summary:
        schools.status === 'ok'
          ? 'Connected, but Aeries returned no schools.'
          : 'Could not connect to Aeries.',
    };
  }

  // Probe against the first school only. This is a permission check, not a
  // sync: one school proves the box is ticked, and walking every school would
  // pull thousands of student records to learn nothing more.
  const school = schoolCodes[0];

  areas.push(
    await probe('students', 'Student Data', async () => {
      // One record, one non-identifying field. Enough to prove access without
      // pulling a name into memory.
      const rows = await client.getSchoolStudents(school, {
        fields: ['StudentID'],
        startingRecord: 1,
        endingRecord: 1,
      });
      return rows.length;
    }),
    await probe('teachers', 'Teacher/Staff Data', async () => {
      const rows = await client.getSchoolTeachers(school, {
        fields: ['TeacherNumber'],
        startingRecord: 1,
        endingRecord: 1,
      });
      return rows.length;
    }),
    await probe('programs', 'Student Programs', async () => {
      // The one that carries special education (program 144/144x). If this is
      // the only area denied, the connection still "works" — which is exactly
      // the confusing half-success worth naming explicitly.
      const rows = await client.getStudentPrograms(school, 0, undefined, {
        // ProgramCode only. Asking for StudentID too would pull an identifiable
        // program-membership record into memory on a flow whose whole contract
        // is that it never touches student data.
        fields: ['ProgramCode'],
        startingRecord: 1,
        endingRecord: 1,
      });
      return rows.length;
    }),
  );

  // `connection` mirrors the Schools outcome, so counting it would report one
  // failure as two to a district trying to work out how much is left to fix.
  const permissionAreas = areas.filter((a) => a.key !== 'connection');
  const failed = permissionAreas.filter((a) => a.status !== 'ok');
  const programsNotOk = areas.some((a) => a.key === 'programs' && a.status !== 'ok');

  let summary: string;
  if (failed.length === 0) {
    summary = 'All areas granted. Aeries is ready.';
  } else if (failed.length === 1 && programsNotOk) {
    // Named specially because it is the likeliest single miss and the most
    // consequential: everything appears to work, but no special-education data
    // ever arrives.
    summary =
      'Connected, but Student Programs is not granted — Speddy cannot see special education records without it.';
  } else {
    summary = `${failed.length} of ${permissionAreas.length} areas need attention in Aeries.`;
  }

  return { ok: failed.length === 0, areas, summary, usedBaseUrl };
}

/**
 * Reduce a report to what may be persisted in `last_test_result`.
 *
 * That column is readable by the district's own staff (SPE-395), so this
 * deliberately drops the counts and keeps only area names and outcomes. A
 * count is aggregate, but "how many special-education students this district
 * has" is not something the connection log needs to remember.
 */
export function toStoredTestResult(report: AeriesTestReport): SisTestResult {
  const failed = report.areas.filter((a) => a.status !== 'ok').map((a) => a.label);
  return {
    area: failed.length ? failed.join(', ') : 'all',
    message: report.summary,
  };
}
