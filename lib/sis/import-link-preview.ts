/**
 * "Which teachers will these students get?" — answered BEFORE the import
 * commits (SPE-546).
 *
 * The import review screen asks this for the district IDs in the file being
 * reviewed, so a provider sees "will be connected to: <teacher> (<class>)"
 * — or "no match in your district's system", while they are looking at the
 * row and can fix a typo'd ID — instead of discovering either after the
 * fact. Read-only: this module NEVER writes; the links themselves are
 * written by the SPE-545 auto sync after the import commits.
 *
 * The matching spine is the link sync's, by construction, not by copy:
 * identifier keys come from `studentIdentifierKeys` (the one home of the
 * Aeries STU-wrapper dialect), enrollments join live classes only, and
 * teachers resolve to SIS-keyed directory rows at the ONE school being
 * imported into. What this module returns is a PREVIEW of what that sync
 * will do — matched teachers with class labels — so the two must never
 * disagree about a student.
 *
 * PRIVACY: the response carries teacher names and class labels keyed by the
 * district IDs the caller posted — directory data the provider already sees
 * everywhere teachers appear. Logs carry counts and fixed words only.
 *
 * Server-only: dials an external SIS with a decrypted credential.
 */
import { logger } from '@/lib/logger';
import { createServiceClient } from '@/lib/supabase/server';
import {
  OneRosterClient,
  type RawOneRosterClass,
  type RawOneRosterEnrollment,
  type RawOneRosterUser,
} from '@/lib/integrations/oneroster';
import { ONEROSTER_URL_LABELS, assertSafeSisUrl } from './ssrf-guard';
import { oneRosterTokenUrlCandidates } from './oneroster-setup';
import { studentIdentifierKeys } from './student-teacher-link-sync';
import type { TeacherSyncConnectionParams } from './teacher-directory-sync';

const log = logger.child({ module: 'import-link-preview' });

// ---------------------------------------------------------------------------
// Shapes — plain data, so the matcher is testable without HTTP.
// ---------------------------------------------------------------------------

export interface PreviewFeedStudent {
  sourcedId: string;
  identifier: string | null;
}

export interface PreviewFeedEnrollment {
  userSourcedId: string;
  classSourcedId: string;
  role: 'student' | 'teacher';
}

export interface PreviewFeedClass {
  sourcedId: string;
  title: string | null;
  periods: string[];
}

/** A SIS-keyed directory teacher at the school being imported into. */
export interface PreviewSchoolTeacher {
  sisId: string;
  name: string;
}

export interface LinkPreviewInput {
  feedStudents: PreviewFeedStudent[];
  feedEnrollments: PreviewFeedEnrollment[];
  feedClasses: PreviewFeedClass[];
  schoolTeachers: PreviewSchoolTeacher[];
}

export interface PreviewTeacher {
  name: string;
  /** Class label, e.g. "Algebra I" — display only, like the link's subject. */
  subject: string | null;
  period: string | null;
}

export type LinkPreviewEntry =
  | { status: 'matched'; teachers: PreviewTeacher[] }
  /** The number found a SIS student, but their teachers aren't in the
   *  school's directory yet (teacher sync not run / new hires). */
  | { status: 'teachers-not-in-directory' }
  | { status: 'not-found' }
  /** More than one SIS record answers to this number — same refusal the
   *  sync makes; the preview must not pretend more certainty than it. */
  | { status: 'multiple-records' };

// ---------------------------------------------------------------------------
// The matcher — pure, mirroring the planner's rungs for ONE school.
// ---------------------------------------------------------------------------

export function previewTeacherLinks(
  input: LinkPreviewInput,
  districtStudentIds: string[],
): Record<string, LinkPreviewEntry> {
  // Live classes only — an enrollment naming a vanished class carries no
  // teachers here, same as the sync counts it stale.
  const classById = new Map<string, PreviewFeedClass>();
  for (const c of input.feedClasses) {
    if (c.sourcedId) classById.set(c.sourcedId, c);
  }

  const classesByStudent = new Map<string, Set<string>>();
  const teachersByClass = new Map<string, Set<string>>();
  for (const e of input.feedEnrollments) {
    if (!e.userSourcedId || !e.classSourcedId || !classById.has(e.classSourcedId)) continue;
    const map = e.role === 'student' ? classesByStudent : teachersByClass;
    const key = e.role === 'student' ? e.userSourcedId : e.classSourcedId;
    const value = e.role === 'student' ? e.classSourcedId : e.userSourcedId;
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  }

  // Same dedupe-then-index the planner does, through the SHARED key helper.
  const seen = new Set<string>();
  const bySisKey = new Map<string, string[]>();
  for (const s of input.feedStudents) {
    if (!s.sourcedId || seen.has(s.sourcedId)) continue;
    seen.add(s.sourcedId);
    if (!s.identifier) continue;
    for (const key of studentIdentifierKeys(s.identifier)) {
      const list = bySisKey.get(key) ?? [];
      list.push(s.sourcedId);
      bySisKey.set(key, list);
    }
  }

  const teacherBySisId = new Map(input.schoolTeachers.map((t) => [t.sisId, t.name]));

  const entries: Record<string, LinkPreviewEntry> = {};
  for (const raw of districtStudentIds) {
    const id = raw.trim();
    if (!id || entries[id]) continue;
    const matches = bySisKey.get(id) ?? [];
    if (matches.length === 0) {
      entries[id] = { status: 'not-found' };
      continue;
    }
    if (matches.length > 1) {
      entries[id] = { status: 'multiple-records' };
      continue;
    }

    // Distinct teachers over all live classes, labels merged the way the
    // sync writes them (titles alphabetical, periods numeric-aware).
    const byTeacher = new Map<string, { titles: Set<string>; periods: Set<string> }>();
    let sawRosterTeacher = false;
    for (const classId of classesByStudent.get(matches[0]) ?? []) {
      const cls = classById.get(classId);
      if (!cls) continue;
      for (const teacherSisId of teachersByClass.get(classId) ?? []) {
        sawRosterTeacher = true;
        const name = teacherBySisId.get(teacherSisId);
        if (!name) continue;
        const entry = byTeacher.get(name) ?? { titles: new Set(), periods: new Set() };
        if (cls.title) entry.titles.add(cls.title);
        for (const p of cls.periods) {
          if (p) entry.periods.add(p);
        }
        byTeacher.set(name, entry);
      }
    }

    if (byTeacher.size === 0) {
      entries[id] = sawRosterTeacher
        ? { status: 'teachers-not-in-directory' }
        : { status: 'matched', teachers: [] };
      continue;
    }

    const numericAware = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true });
    const teachers: PreviewTeacher[] = [...byTeacher.entries()]
      .map(([name, { titles, periods }]) => ({
        name,
        subject: titles.size > 0 ? [...titles].sort(numericAware).join(' / ') : null,
        period: periods.size > 0 ? [...periods].sort(numericAware).join('/') : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    entries[id] = { status: 'matched', teachers };
  }
  return entries;
}

// ---------------------------------------------------------------------------
// IO — the SIS half plus the one school's directory teachers.
// ---------------------------------------------------------------------------

const trimOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * Fetch everything `previewTeacherLinks` needs. Full pagination on the SIS
 * side, same reasoning as the sync loaders: a missed page reads as "this
 * student has no teachers", which the review screen would then show a
 * provider as fact.
 */
export async function loadLinkPreviewInput(
  params: TeacherSyncConnectionParams,
  schoolId: string,
): Promise<LinkPreviewInput> {
  const tokenUrl =
    (params.tokenUrl ?? '').trim() || oneRosterTokenUrlCandidates(params.baseUrl)[0];
  if (!tokenUrl) throw new Error('This connection has no usable token address.');

  await assertSafeSisUrl(params.baseUrl, ONEROSTER_URL_LABELS);
  await assertSafeSisUrl(tokenUrl, ONEROSTER_URL_LABELS);

  const client = new OneRosterClient({
    baseUrl: params.baseUrl,
    tokenUrl,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  const rawStudents = await client.getAllPages<RawOneRosterUser>('students', 'users');
  const feedStudents: PreviewFeedStudent[] = rawStudents.flatMap((s) => {
    if (s.status === 'tobedeleted') return [];
    const sourcedId = trimOrNull(s.sourcedId);
    if (!sourcedId) return [];
    return [{ sourcedId, identifier: trimOrNull(s.identifier) }];
  });

  const rawEnrollments = await client.getAllPages<RawOneRosterEnrollment>(
    'enrollments',
    'enrollments',
  );
  const feedEnrollments: PreviewFeedEnrollment[] = rawEnrollments.flatMap((e) => {
    const role = typeof e.role === 'string' ? e.role.trim().toLowerCase() : '';
    const status = typeof e.status === 'string' ? e.status.trim().toLowerCase() : '';
    if (status === 'tobedeleted') return [];
    if (role !== 'student' && role !== 'teacher') return [];
    const userSourcedId = trimOrNull(e.user?.sourcedId);
    const classSourcedId = trimOrNull(e.class?.sourcedId);
    if (!userSourcedId || !classSourcedId) return [];
    return [{ userSourcedId, classSourcedId, role }];
  });

  const rawClasses = await client.getAllPages<RawOneRosterClass>('classes', 'classes');
  const feedClasses: PreviewFeedClass[] = rawClasses.flatMap((c) => {
    if (c.status === 'tobedeleted') return [];
    const sourcedId = trimOrNull(c.sourcedId);
    if (!sourcedId) return [];
    return [
      {
        sourcedId,
        title: trimOrNull(c.title),
        periods: Array.isArray(c.periods)
          ? c.periods.flatMap((p) => {
              const trimmed = trimOrNull(p);
              return trimmed ? [trimmed] : [];
            })
          : [],
      },
    ];
  });

  // The one school's SIS-keyed teachers — names included, because the whole
  // point is showing the provider WHO. Paged like every directory read.
  const supabase = createServiceClient();
  const schoolTeachers: PreviewSchoolTeacher[] = [];
  const DB_PAGE = 1000;
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await supabase
      .from('teachers')
      .select('first_name, last_name, sis_id')
      .eq('school_id', schoolId)
      .eq('sis_source', 'oneroster')
      .not('sis_id', 'is', null)
      .order('id')
      .range(from, from + DB_PAGE - 1);
    if (error) throw new Error(`Could not load the school's teachers: ${error.message}`);
    for (const t of data ?? []) {
      const name = [t.first_name, t.last_name].filter(Boolean).join(' ').trim();
      if (t.sis_id && name) schoolTeachers.push({ sisId: String(t.sis_id), name });
    }
    if (!data || data.length < DB_PAGE) break;
  }

  log.info('Import link preview input loaded', {
    schoolId,
    feedStudents: feedStudents.length,
    enrollments: feedEnrollments.length,
    classes: feedClasses.length,
    schoolTeachers: schoolTeachers.length,
  });

  return { feedStudents, feedEnrollments, feedClasses, schoolTeachers };
}
