/**
 * Read-only SIS directories for the district admin view (SPE-436).
 *
 * Phase 0 of SPE-414, in the owner's sequencing: the district admin SEES the
 * SIS data populate cleanly before any of it flows into Speddy's own records.
 * So this module only READS — live from the district's OneRoster server, per
 * request, nothing stored — and shapes each area into an explicitly picked
 * row plus data-quality aggregates ("84 of 84 with an email").
 *
 * THE PICK IS THE CONTRACT. Raw SIS rows are never spread into a response: a
 * field this module does not name cannot reach a browser, however much the
 * vendor's payload carries. That is the same allow-list posture as every SIS
 * derivation in this codebase (SPE-430/434/435), applied to row shaping — and
 * it is what keeps this surface inside the no-demographics line even if a
 * server volunteers more than the spec asks it to.
 *
 * Server-only: dials an external SIS with a decrypted credential.
 */
import {
  OneRosterClient,
  type RawOneRosterClass,
  type RawOneRosterSchool,
  type RawOneRosterUser,
} from '@/lib/integrations/oneroster';
import { ONEROSTER_URL_LABELS, assertSafeSisUrl } from './ssrf-guard';
import { oneRosterTokenUrlCandidates } from './oneroster-setup';

export type DirectoryArea = 'teachers' | 'students' | 'classes' | 'schools';

export const DIRECTORY_AREAS: DirectoryArea[] = ['teachers', 'students', 'classes', 'schools'];

/** One page per request. JSUSD-sized areas fit in one; larger districts page. */
export const DIRECTORY_PAGE_SIZE = 200;

/** A person row — teachers and students share the shape, not the fields' meaning. */
export interface DirectoryPersonRow {
  /** OneRoster's stable id — a react key, never displayed as identity. */
  sourcedId: string;
  name: string;
  /** Teachers: work email. Students: student email when the district assigns one. */
  email: string | null;
  /** Teachers: staff ID. Students: the district student ID our imports match on. */
  identifier: string | null;
  grades: string[];
  /** School names resolved from the district's own /schools list. */
  schools: string[];
}

export interface DirectoryClassRow {
  sourcedId: string;
  title: string;
  classType: string | null;
  subjects: string[];
  periods: string[];
  grades: string[];
}

export interface DirectorySchoolRow {
  sourcedId: string;
  name: string;
  identifier: string | null;
  type: string | null;
}

export type DirectoryRow = DirectoryPersonRow | DirectoryClassRow | DirectorySchoolRow;

/**
 * A named count the panel shows above the table — the owner's "our check".
 * Numeric on purpose: the client sums stats across appended pages by label,
 * so counting stays server-side and only formatting lives in the page.
 */
export interface DirectoryStat {
  label: string;
  n: number;
  /** When present, renders as "n of of" — a coverage ratio. */
  of?: number;
}

export interface DirectoryPage {
  area: DirectoryArea;
  rows: DirectoryRow[];
  offset: number;
  /**
   * True when the page came back full — more rows may exist, and every stat
   * below describes THIS page, not the district. The UI says so.
   */
  pageFull: boolean;
  stats: DirectoryStat[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

function personName(raw: RawOneRosterUser): string {
  const given = str(raw.givenName) ?? '';
  const family = str(raw.familyName) ?? '';
  const joined = `${given} ${family}`.trim();
  return joined || '(no name given)';
}

function pickPerson(raw: RawOneRosterUser, schoolNames: Map<string, string>): DirectoryPersonRow {
  return {
    sourcedId: raw.sourcedId,
    name: personName(raw),
    email: str(raw.email),
    identifier: str(raw.identifier),
    grades: strArray(raw.grades),
    schools: (raw.orgs ?? [])
      .map((o) => schoolNames.get(o.sourcedId))
      .filter((n): n is string => Boolean(n)),
  };
}

function pickClass(raw: RawOneRosterClass): DirectoryClassRow {
  return {
    sourcedId: raw.sourcedId,
    title: str(raw.title) ?? '(untitled class)',
    classType: str(raw.classType),
    subjects: strArray(raw.subjects),
    periods: strArray(raw.periods),
    grades: strArray(raw.grades),
  };
}

function pickSchool(raw: RawOneRosterSchool): DirectorySchoolRow {
  return {
    sourcedId: raw.sourcedId,
    name: str(raw.name) ?? '(unnamed school)',
    identifier: str(raw.identifier),
    type: str(raw.type),
  };
}

function personStats(rows: DirectoryPersonRow[], noun: string): DirectoryStat[] {
  const withEmail = rows.filter((r) => r.email).length;
  const withId = rows.filter((r) => r.identifier).length;
  const withGrade = rows.filter((r) => r.grades.length > 0).length;
  return [
    { label: `${noun} listed`, n: rows.length },
    { label: 'with an email', n: withEmail, of: rows.length },
    { label: noun === 'Students' ? 'with a district ID' : 'with a staff ID', n: withId, of: rows.length },
    { label: 'with a grade level', n: withGrade, of: rows.length },
  ];
}

function classStats(rows: DirectoryClassRow[]): DirectoryStat[] {
  const homeroom = rows.filter((r) => r.classType === 'homeroom').length;
  const scheduled = rows.filter((r) => r.classType === 'scheduled').length;
  const untyped = rows.length - homeroom - scheduled;
  const withSubject = rows.filter((r) => r.subjects.length > 0).length;
  return [
    { label: 'Classes listed', n: rows.length },
    { label: 'homeroom', n: homeroom },
    { label: 'scheduled', n: scheduled },
    { label: 'untyped', n: untyped },
    { label: 'with a subject', n: withSubject, of: rows.length },
  ];
}

/**
 * Fetch one directory page, live from the district's OneRoster server.
 *
 * Uses the STORED token address, or the first derived candidate when none is
 * stored — never the full candidate hunt. Resolution belongs to the connection
 * test; a directory read against an unhealthy connection should fail fast and
 * point the admin at the tech portal's test, not go probing a production SIS.
 */
export async function fetchDirectoryPage(params: {
  baseUrl: string;
  tokenUrl?: string | null;
  clientId: string;
  clientSecret: string;
  area: DirectoryArea;
  offset?: number;
}): Promise<DirectoryPage> {
  const tokenUrl =
    (params.tokenUrl ?? '').trim() || oneRosterTokenUrlCandidates(params.baseUrl)[0];
  if (!tokenUrl) throw new Error('This connection has no usable token address.');

  // Re-guarded at dial time like every caller: stored rows can predate the
  // guard, and DNS answers change (SPE-396's control, kept CALLED).
  await assertSafeSisUrl(params.baseUrl, ONEROSTER_URL_LABELS);
  await assertSafeSisUrl(tokenUrl, ONEROSTER_URL_LABELS);

  const client = new OneRosterClient({
    baseUrl: params.baseUrl,
    tokenUrl,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  const offset = Math.max(0, params.offset ?? 0);
  const paging = { limit: DIRECTORY_PAGE_SIZE, offset };

  if (params.area === 'schools') {
    const rows = (await client.getSchools(paging)).map(pickSchool);
    return {
      area: params.area,
      rows,
      offset,
      pageFull: rows.length === DIRECTORY_PAGE_SIZE,
      stats: [{ label: 'Schools listed', n: rows.length }],
    };
  }

  if (params.area === 'classes') {
    const rows = (await client.getClasses(paging)).map(pickClass);
    return {
      area: params.area,
      rows,
      offset,
      pageFull: rows.length === DIRECTORY_PAGE_SIZE,
      stats: classStats(rows),
    };
  }

  // Teachers and students carry org links, not school names. The district's
  // own /schools list is small and resolves them in one extra read.
  const schoolNames = new Map<string, string>();
  try {
    // Follow full pages a few deep: a first page that comes back full may be
    // a truncation, and a person whose school fell off the map would render
    // an empty School column — indistinguishable from the SIS not linking
    // them, which is exactly the data-quality signal this surface displays.
    for (let page = 0; page < 5; page += 1) {
      const batch = await client.getSchools({
        limit: DIRECTORY_PAGE_SIZE,
        offset: page * DIRECTORY_PAGE_SIZE,
      });
      for (const school of batch) {
        const name = str(school.name);
        if (name) schoolNames.set(school.sourcedId, name);
      }
      if (batch.length < DIRECTORY_PAGE_SIZE) break;
    }
  } catch {
    // A directory without school names is degraded, not dead — rows still
    // render, the schools column is simply empty.
  }

  const rawRows =
    params.area === 'teachers' ? await client.getTeachers(paging) : await client.getStudents(paging);
  const rows = rawRows.map((r) => pickPerson(r, schoolNames));
  return {
    area: params.area,
    rows,
    offset,
    pageFull: rows.length === DIRECTORY_PAGE_SIZE,
    stats: personStats(rows, params.area === 'teachers' ? 'Teachers' : 'Students'),
  };
}
