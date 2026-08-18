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
 * The matching spine is the link sync's BY CONSTRUCTION, not by copy: the
 * feed comes from the shared `loadOneRosterRosterFeed`, identifier keys from
 * the shared `studentIdentifierKeys`, and labels from the shared
 * `linkLabels` — so a student the preview shows matched resolves the same
 * way when the sync runs. One stated caveat: the preview resolves teachers
 * at the school being IMPORTED INTO, while the sync resolves at the child
 * record's canonical school — for the rare shared child whose canonical
 * school differs from the importing school, the preview can show that
 * school's view of the rosters rather than the canonical one. The sync
 * remains the truth-writer either way.
 *
 * PRIVACY: the response carries teacher names and class labels keyed by the
 * district IDs the caller posted — directory data the provider already sees
 * wherever teachers appear. Logs carry counts and fixed words only.
 *
 * Server-only: dials an external SIS with a decrypted credential.
 */
import { logger } from '@/lib/logger';
import { createServiceClient } from '@/lib/supabase/server';
import {
  linkLabels,
  loadOneRosterRosterFeed,
  studentIdentifierKeys,
  type LinkFeedClass,
  type LinkFeedEnrollment,
  type LinkFeedStudent,
} from './student-teacher-link-sync';
import { TEACHER_SIS_SOURCE, type TeacherSyncConnectionParams } from './teacher-directory-sync';

const log = logger.child({ module: 'import-link-preview' });

// ---------------------------------------------------------------------------
// Shapes — plain data, so the matcher is testable without HTTP.
// ---------------------------------------------------------------------------

/** A SIS-keyed directory teacher at the school being imported into. */
export interface PreviewSchoolTeacher {
  sisId: string;
  name: string;
}

export interface LinkPreviewInput {
  feedStudents: LinkFeedStudent[];
  feedEnrollments: LinkFeedEnrollment[];
  feedClasses: LinkFeedClass[];
  schoolTeachers: PreviewSchoolTeacher[];
}

export interface PreviewTeacher {
  name: string;
  /** Class label, e.g. "Algebra I" — display only, like the link's subject. */
  subject: string | null;
  period: string | null;
}

export type LinkPreviewEntry =
  | {
      status: 'matched';
      teachers: PreviewTeacher[];
      /**
       * Roster teachers of this student with NO directory row at this school
       * (teacher sync behind / new hires). Shown so a partially synced
       * directory cannot make the list LOOK complete (PR #896 review).
       */
      missingFromDirectory: number;
    }
  /** The number found a SIS student, but NONE of their teachers are in the
   *  school's directory yet. */
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
  const classById = new Map<string, LinkFeedClass>();
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

  // Built as a Map so a district ID that collides with an Object.prototype
  // member ('constructor', 'hasOwnProperty', …) — file-controlled input —
  // cannot be silently skipped or resolve to an inherited value. Serialized
  // to own-properties-only at the end (PR #896 review).
  const entries = new Map<string, LinkPreviewEntry>();
  for (const raw of districtStudentIds) {
    const id = raw.trim();
    if (!id || entries.has(id)) continue;
    const matches = bySisKey.get(id) ?? [];
    if (matches.length === 0) {
      entries.set(id, { status: 'not-found' });
      continue;
    }
    if (matches.length > 1) {
      entries.set(id, { status: 'multiple-records' });
      continue;
    }

    // Distinct teachers over all live classes, keyed by SIS IDENTITY — the
    // same identity the sync links by — so two directory teachers who share
    // a display name stay two rows, exactly as two links will be written
    // (PR #896 review, self + Codex). Labels via the sync's own helper.
    const bySisTeacher = new Map<string, { titles: Set<string>; periods: Set<string> }>();
    const missingSisIds = new Set<string>();
    for (const classId of classesByStudent.get(matches[0]) ?? []) {
      const cls = classById.get(classId);
      if (!cls) continue;
      for (const teacherSisId of teachersByClass.get(classId) ?? []) {
        if (!teacherBySisId.has(teacherSisId)) {
          missingSisIds.add(teacherSisId);
          continue;
        }
        const entry = bySisTeacher.get(teacherSisId) ?? { titles: new Set(), periods: new Set() };
        if (cls.title) entry.titles.add(cls.title);
        for (const p of cls.periods) {
          if (p) entry.periods.add(p);
        }
        bySisTeacher.set(teacherSisId, entry);
      }
    }

    if (bySisTeacher.size === 0 && missingSisIds.size > 0) {
      entries.set(id, { status: 'teachers-not-in-directory' });
      continue;
    }

    const teachers: PreviewTeacher[] = [...bySisTeacher.entries()]
      .map(([sisId, { titles, periods }]) => {
        const { subject, period } = linkLabels(titles, periods);
        return { name: teacherBySisId.get(sisId) as string, subject, period };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    entries.set(id, {
      status: 'matched',
      teachers,
      missingFromDirectory: missingSisIds.size,
    });
  }
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// IO — the shared SIS feed plus the one school's directory teachers.
// ---------------------------------------------------------------------------

/**
 * Fetch everything `previewTeacherLinks` needs: the shared roster feed (one
 * pick set, full pagination, walks in parallel — a human is waiting on this
 * path) and the school's SIS-keyed teacher names, read concurrently with it.
 */
export async function loadLinkPreviewInput(
  params: TeacherSyncConnectionParams,
  schoolId: string,
): Promise<LinkPreviewInput> {
  const loadSchoolTeachers = async (): Promise<PreviewSchoolTeacher[]> => {
    const supabase = createServiceClient();
    const schoolTeachers: PreviewSchoolTeacher[] = [];
    const DB_PAGE = 1000;
    for (let from = 0; ; from += DB_PAGE) {
      const { data, error } = await supabase
        .from('teachers')
        .select('first_name, last_name, sis_id')
        .eq('school_id', schoolId)
        // The DIRECTORY's constant — the same filter the link sync applies.
        .eq('sis_source', TEACHER_SIS_SOURCE)
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
    return schoolTeachers;
  };

  const [feed, schoolTeachers] = await Promise.all([
    loadOneRosterRosterFeed(params),
    loadSchoolTeachers(),
  ]);

  log.info('Import link preview input loaded', {
    schoolId,
    feedStudents: feed.feedStudents.length,
    enrollments: feed.feedEnrollments.length,
    classes: feed.feedClasses.length,
    schoolTeachers: schoolTeachers.length,
  });

  return { ...feed, schoolTeachers };
}
