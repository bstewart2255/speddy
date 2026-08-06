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
import type { SisTestResult } from './connections';

export const AERIES_API_PATH = '/aeries/api/v5';

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

  // Strip whatever path they landed on and append the API path ourselves.
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
  status: 'ok' | 'denied' | 'error';
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
  const client = new AeriesClient({
    baseUrl: params.baseUrl,
    certificate: params.certificate,
  });

  const areas: AeriesAreaResult[] = [];

  // 1. Reachability + certificate. `schools` doubles as the auth check: it is
  // the smallest endpoint that requires a valid cert, and it carries no
  // student data, so a failed connection never touches PII.
  let schoolCodes: number[] = [];
  const schools = await probe('schools', 'Schools', async () => {
    const list = await client.getSchools({ fields: ['SchoolCode', 'Name'] });
    schoolCodes = list.map((s) => s.SchoolCode).filter((c) => Number.isFinite(c));
    return list.length;
  });
  areas.push(
    schools.status === 'ok'
      ? { key: 'connection', label: 'Connection', status: 'ok', message: 'Speddy can reach your Aeries instance.' }
      : { key: 'connection', label: 'Connection', status: schools.status, message: schools.message },
    schools,
  );

  if (schools.status !== 'ok' || schoolCodes.length === 0) {
    const blocked: AeriesAreaResult['status'] = 'error';
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
        fields: ['StudentID', 'ProgramCode'],
        startingRecord: 1,
        endingRecord: 1,
      });
      return rows.length;
    }),
  );

  const failed = areas.filter((a) => a.status !== 'ok');
  const programsDenied = areas.some((a) => a.key === 'programs' && a.status !== 'ok');

  let summary: string;
  if (failed.length === 0) {
    summary = 'All areas granted. Aeries is ready.';
  } else if (failed.length === 1 && programsDenied) {
    // Named specially because it is the likeliest single miss and the most
    // consequential: everything appears to work, but no special-education data
    // ever arrives.
    summary =
      'Connected, but Student Programs is not granted — Speddy cannot see special education records without it.';
  } else {
    summary = `${failed.length} of ${areas.length} areas need attention in Aeries.`;
  }

  return { ok: failed.length === 0, areas, summary };
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
