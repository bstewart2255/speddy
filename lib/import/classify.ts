/**
 * Classification for the bulk student-import preview (SPE-230).
 *
 * Pure, unit-tested functions that turn parsed rows + matched DB state into
 * preview rows with an insert/update/skip action. Three producers share the
 * change-detection helpers:
 *   - buildStudentPreviews:  the main SEIS/CSV goals path (name-matched).
 *   - buildUpdatePreviews:   the deliveries/class-list "update-only" path,
 *                            where rows fall out as updates to existing students
 *                            (the students file is absent).
 *   - buildRosterPreviews:   the Speddy roster-template path (initials+grade).
 *
 * Logic is preserved verbatim from the previous single-file route; notably the
 * update-only schedule uses the raw delivery `weeklyMinutes` while the main path
 * applies a `|| sessionsPerWeek*minutesPerSession` fallback — an intentional
 * divergence kept intact.
 */
import { matchStudents, DatabaseStudent } from '@/lib/utils/student-matcher';
import type { ParsedStudent as SeisParsedStudent } from '@/lib/parsers/seis-parser';
import type { ParsedStudent as CsvParsedStudent } from '@/lib/parsers/csv-parser';
import { createNormalizedKey } from '@/lib/parsers/name-utils';
import {
  matchTeacher,
  parseTeacherName,
  TeacherInfo,
  ClassListStudent,
} from '@/lib/parsers/class-list-parser';
import { DeliveryRecord } from '@/lib/parsers/deliveries-parser';
import { IepDatesRecord } from '@/lib/parsers/iep-dates-parser';
import type { IepDatesPreview } from '@/lib/types/student-import';
import { buildStudentDedupKey } from '@/lib/utils/student-dedup-key';
import { classifyRosterChange } from '@/lib/import/roster-preview';
import { resolveClassListTeacher } from '@/lib/import/enrich';
import type {
  DbTeacherRow,
  GoalChange,
  JoinedExistingStudent,
  ScheduleData,
  StudentChanges,
  StudentPreview,
  StudentUpdate,
  TeacherMatch,
  UnmatchedStudent,
} from '@/lib/import/preview-types';

/**
 * Compare two arrays of goals to determine what's changed
 * Goals are compared by normalized text (lowercase, trimmed)
 */
export function compareGoals(existingGoals: string[] | undefined, newGoals: string[]): GoalChange {
  const existing = (existingGoals || []).map(g => g.toLowerCase().trim());
  const incoming = newGoals.map(g => g.toLowerCase().trim());

  const existingSet = new Set(existing);
  const incomingSet = new Set(incoming);

  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  // Find added goals (in new but not in existing)
  for (let i = 0; i < newGoals.length; i++) {
    const normalizedGoal = incoming[i];
    if (!existingSet.has(normalizedGoal)) {
      added.push(newGoals[i]);
    } else {
      unchanged.push(newGoals[i]);
    }
  }

  // Find removed goals (in existing but not in new)
  for (let i = 0; i < (existingGoals || []).length; i++) {
    const normalizedGoal = existing[i];
    if (!incomingSet.has(normalizedGoal)) {
      removed.push(existingGoals![i]);
    }
  }

  return { added, removed, unchanged };
}

/**
 * Determine if there are any meaningful changes between existing and new data
 */
export function hasChanges(
  existingStudent: DatabaseStudent,
  newGoals: string[],
  newSchedule?: { sessionsPerWeek: number; minutesPerSession: number },
  newTeacherId?: string | null
): { hasGoalChanges: boolean; hasScheduleChanges: boolean; hasTeacherChanges: boolean } {
  // Compare goals
  const goalComparison = compareGoals(existingStudent.iep_goals, newGoals);
  const hasGoalChanges = goalComparison.added.length > 0 || goalComparison.removed.length > 0;

  // Compare schedule
  let hasScheduleChanges = false;
  if (newSchedule) {
    hasScheduleChanges =
      existingStudent.sessions_per_week !== newSchedule.sessionsPerWeek ||
      existingStudent.minutes_per_session !== newSchedule.minutesPerSession;
  }

  // Compare teacher
  let hasTeacherChanges = false;
  if (newTeacherId !== undefined) {
    hasTeacherChanges = existingStudent.teacher_id !== newTeacherId;
  }

  return { hasGoalChanges, hasScheduleChanges, hasTeacherChanges };
}

/** Flat existing-student row shape the main path selects. */
export interface ExistingStudentRow {
  id: string;
  initials: string | null;
  grade_level: string | null;
  school_site: string | null;
  school_id: string | null;
  sessions_per_week: number | null;
  minutes_per_session: number | null;
  teacher_id: string | null;
}

/** Detail row shape the main path selects for names + goals. */
export interface StudentDetailRow {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  iep_goals: string[] | null;
  /** Stored IEP compliance dates (ISO YYYY-MM-DD) for IEP Dates change detection (SPE-303). */
  upcoming_iep_date?: string | null;
  upcoming_triennial_date?: string | null;
}

/**
 * Build the review-facing IEP Dates payload for a matched student (SPE-303).
 * Each date is present only when the file supplied a parseable value; `changed`
 * is `value !== stored`. Returns null when the file carried no usable date, so
 * an empty enrichment doesn't fabricate an update. `changed` on the aggregate is
 * true iff any present date differs from what's stored (drives insert/update/skip).
 */
export function buildIepDatesPreview(
  record: Pick<IepDatesRecord, 'upcomingIepDate' | 'upcomingTriennialDate'>,
  existingIepDate: string | null,
  existingTriennialDate: string | null,
): { iepDates: IepDatesPreview; changed: boolean } | null {
  const iepDates: IepDatesPreview = {};
  let changed = false;

  if (record.upcomingIepDate !== undefined) {
    const isChanged = record.upcomingIepDate !== existingIepDate;
    iepDates.upcomingIepDate = { value: record.upcomingIepDate, old: existingIepDate, changed: isChanged };
    changed = changed || isChanged;
  }
  if (record.upcomingTriennialDate !== undefined) {
    const isChanged = record.upcomingTriennialDate !== existingTriennialDate;
    iepDates.upcomingTriennialDate = { value: record.upcomingTriennialDate, old: existingTriennialDate, changed: isChanged };
    changed = changed || isChanged;
  }

  if (!iepDates.upcomingIepDate && !iepDates.upcomingTriennialDate) return null;
  return { iepDates, changed };
}

/**
 * Combine students with their details for matching (includes goals for UPSERT
 * comparison). Verbatim from the previous route.
 */
export function toDatabaseStudents(
  dbStudents: ExistingStudentRow[] | null | undefined,
  studentDetails: StudentDetailRow[] | null | undefined
): DatabaseStudent[] {
  return (
    dbStudents?.map(student => {
      const details = studentDetails?.find(d => d.student_id === student.id);
      return {
        id: student.id,
        initials: student.initials,
        grade_level: student.grade_level,
        first_name: details?.first_name || undefined,
        last_name: details?.last_name || undefined,
        // For UPSERT comparison
        iep_goals: details?.iep_goals || undefined,
        sessions_per_week: student.sessions_per_week || undefined,
        minutes_per_session: student.minutes_per_session || undefined,
        teacher_id: student.teacher_id || undefined,
        // Stored IEP dates, for IEP Dates change detection (SPE-303).
        upcoming_iep_date: details?.upcoming_iep_date ?? null,
        upcoming_triennial_date: details?.upcoming_triennial_date ?? null,
      } as DatabaseStudent;
    }) || []
  );
}

export interface MainPreviewResult {
  studentPreviews: StudentPreview[];
  matchedDeliveryNames: Set<string>;
  matchedClassListNames: Set<string>;
  matchedIepDatesNames: Set<string>;
}

/**
 * Main SEIS/CSV goals path: match parsed students to the database, enrich with
 * deliveries/class-list data, and assign insert/update/skip. Verbatim logic.
 */
export function buildStudentPreviews(params: {
  parsedStudents: SeisParsedStudent[];
  databaseStudents: DatabaseStudent[];
  deliveriesData: Map<string, DeliveryRecord> | null;
  classListData: Map<string, ClassListStudent> | null;
  iepDatesData?: Map<string, IepDatesRecord> | null;
  dbTeachers: DbTeacherRow[];
  /**
   * Opt into the SPE-284 initials-enrichment fallback. Safe only when the caller
   * fed school-scoped candidates AND confirmed student_details loaded (so a
   * missing name means "no details row", not "load failed"). The pipeline sets
   * this; defaults off for other/unscoped callers.
   */
  enrichNoNameByInitials?: boolean;
}): MainPreviewResult {
  const {
    parsedStudents,
    databaseStudents,
    deliveriesData,
    classListData,
    iepDatesData = null,
    dbTeachers,
    enrichNoNameByInitials = false,
  } = params;

  const matchResult = matchStudents(parsedStudents, databaseStudents, { enrichNoNameByInitials });

  // Track which students from deliveries/classList/iepDates were matched
  const matchedDeliveryNames = new Set<string>();
  const matchedClassListNames = new Set<string>();
  const matchedIepDatesNames = new Set<string>();

  // Process each student: prepare preview data (goals flow through verbatim).
  const studentPreviews: StudentPreview[] = [];

  for (const match of matchResult.matches) {
    const student = match.excelStudent;

    // Create normalized key for matching across files
    const normalizedKey = createNormalizedKey(student.firstName, student.lastName);

    // Determine match status and UPSERT action
    const isNew = match.confidence === 'none';
    const matchedStudent = match.matchedStudent;

    // Goals are imported verbatim (SPE-238) — no at-rest PII scrubbing. Use the
    // raw goal texts for both change detection and the preview payload.
    const goalTexts = student.goals;

    // Initialize preview with schedule/teacher data for change detection
    let scheduleData: { sessionsPerWeek: number; minutesPerSession: number } | undefined;
    let teacherMatchResult: TeacherMatch | undefined;

    // Match with deliveries data first (need for change detection)
    if (deliveriesData) {
      const deliveryRecord = deliveriesData.get(normalizedKey);
      if (deliveryRecord) {
        matchedDeliveryNames.add(normalizedKey);
        scheduleData = {
          sessionsPerWeek: deliveryRecord.sessionsPerWeek,
          minutesPerSession: deliveryRecord.minutesPerSession
        };
      }
    }

    // Match with class list data (need for change detection)
    if (classListData) {
      const classListStudent = classListData.get(normalizedKey);
      if (classListStudent) {
        matchedClassListNames.add(normalizedKey);
        teacherMatchResult = resolveClassListTeacher(classListStudent.teacher, dbTeachers);
      }
    }

    // Match with IEP Dates data (SPE-303). File wins: a present date overwrites
    // the stored one; a row whose dates equal what's stored is not a change. For
    // an insert there is no matchedStudent, so old is null (any present date is
    // shown against a blank).
    let iepDatesResult: { iepDates: IepDatesPreview; changed: boolean } | null = null;
    if (iepDatesData) {
      const iepRecord = iepDatesData.get(normalizedKey);
      if (iepRecord) {
        matchedIepDatesNames.add(normalizedKey);
        iepDatesResult = buildIepDatesPreview(
          iepRecord,
          matchedStudent?.upcoming_iep_date ?? null,
          matchedStudent?.upcoming_triennial_date ?? null,
        );
      }
    }

    // Determine action and track changes
    let action: 'insert' | 'update' | 'skip' = 'insert';
    let changes: StudentChanges | undefined;
    let goalsRemoved: string[] | undefined;

    if (!isNew && matchedStudent) {
      // An unresolved class-list teacher (teacherId === null) is not a real
      // change — pass undefined so hasChanges doesn't fabricate a "teacher → none"
      // change (SPE-262). The row is still kept actionable below.
      const changeCheck = hasChanges(
        matchedStudent,
        goalTexts,
        scheduleData,
        teacherMatchResult?.teacherId ?? undefined
      );

      const goalComparison = compareGoals(matchedStudent.iep_goals, goalTexts);
      // A named class-list teacher that didn't resolve to a DB teacher is surfaced
      // as a reviewable exception, so keep the row actionable (an 'update') even
      // when nothing else changed: the user resolves it in the review's exceptions
      // queue and it's applied on confirm. We deliberately do NOT fabricate a
      // teacher change for it (the teacher block below only fires for a resolved
      // teacher), so the preview shows no misleading "teacher → none" (SPE-262).
      // The non-blank name check mirrors the exception-creation rule in
      // adaptBulkPreview, so we never mark a row 'update' with nothing to act on.
      const hasUnresolvedTeacher =
        !!teacherMatchResult &&
        teacherMatchResult.teacherId === null &&
        !!teacherMatchResult.teacherName?.trim();
      // SPE-284: fill an existing initials-only record's empty name from a named
      // upload (enrichment). Only fills a fully-blank name — never overwrites an
      // existing one (correcting a stored name is out of scope for the
      // foundation). This is what turns an otherwise-unchanged enrichment match
      // into an 'update' instead of a 'skip', so the name is applied on confirm.
      // Any non-blank stored name (even a partial first-XOR-last) counts as an
      // existing identity and blocks enrichment. The matcher already restricts
      // enrichment matches to both-blank rows, so this is defense-in-depth —
      // classify stays correct even if that upstream guarantee ever changes.
      const incomingHasName = !!(student.firstName?.trim() && student.lastName?.trim());
      const existingHasAnyName = !!(matchedStudent.first_name?.trim() || matchedStudent.last_name?.trim());
      const hasNameChange = incomingHasName && !existingHasAnyName;
      // An IEP Dates match with a date that differs from what's stored makes the
      // row an update even if nothing else changed; identical dates stay a skip.
      const hasIepDateChange = iepDatesResult?.changed ?? false;
      const anyChanges =
        changeCheck.hasGoalChanges ||
        changeCheck.hasScheduleChanges ||
        changeCheck.hasTeacherChanges ||
        hasUnresolvedTeacher ||
        hasNameChange ||
        hasIepDateChange;

      if (anyChanges) {
        action = 'update';
        changes = {};

        // Track goal changes
        if (changeCheck.hasGoalChanges) {
          changes.goals = goalComparison;
          // Set warning if goals are being removed
          if (goalComparison.removed.length > 0) {
            goalsRemoved = goalComparison.removed;
          }
        }

        // Track schedule changes
        if (changeCheck.hasScheduleChanges && scheduleData) {
          changes.schedule = {
            old: matchedStudent.sessions_per_week || matchedStudent.minutes_per_session
              ? {
                  sessionsPerWeek: matchedStudent.sessions_per_week,
                  minutesPerSession: matchedStudent.minutes_per_session
                }
              : null,
            new: scheduleData
          };
        }

        // Track teacher changes
        if (changeCheck.hasTeacherChanges && teacherMatchResult) {
          // Find existing teacher name for display
          let existingTeacherName: string | undefined;
          if (matchedStudent.teacher_id) {
            const existingTeacher = dbTeachers.find(t => t.id === matchedStudent.teacher_id);
            if (existingTeacher) {
              existingTeacherName = [existingTeacher.first_name, existingTeacher.last_name].filter(Boolean).join(' ');
            }
          }

          changes.teacher = {
            old: matchedStudent.teacher_id
              ? { teacherId: matchedStudent.teacher_id, teacherName: existingTeacherName }
              : null,
            new: {
              teacherId: teacherMatchResult.teacherId,
              teacherName: teacherMatchResult.teacherName
            }
          };
        }
        // A name-only enrichment (SPE-284) carries no entry in `changes` — it is
        // surfaced in the review via the row's low match confidence + the name in
        // displayName, so a "select all → confirm" can't silently enrich by a guess.
      } else {
        action = 'skip';
      }
    }

    // Build preview object
    const preview: StudentPreview = {
      firstName: student.firstName,
      lastName: student.lastName,
      initials: student.initials,
      gradeLevel: student.gradeLevel,
      goals: goalTexts.map((text) => ({ text })),
      action,
      matchedStudentId: isNew ? undefined : matchedStudent?.id,
      matchedStudentInitials: isNew ? undefined : matchedStudent?.initials,
      matchConfidence: isNew ? undefined : (match.confidence === 'none' ? undefined : match.confidence as 'high' | 'medium' | 'low'),
      matchReason: isNew ? undefined : match.reason,
      changes,
      goalsRemoved
    };

    // Add schedule data to preview
    if (scheduleData) {
      const deliveryRecord = deliveriesData?.get(normalizedKey);
      preview.schedule = {
        sessionsPerWeek: scheduleData.sessionsPerWeek,
        minutesPerSession: scheduleData.minutesPerSession,
        weeklyMinutes: deliveryRecord?.weeklyMinutes || scheduleData.sessionsPerWeek * scheduleData.minutesPerSession,
        frequency: deliveryRecord?.sessionsFrequency || `${scheduleData.sessionsPerWeek}x/week`
      };
    }

    // Add teacher data to preview
    if (teacherMatchResult) {
      preview.teacher = teacherMatchResult;
    }

    // Add IEP Dates data to preview (SPE-303). Carried for insert and update rows
    // alike so the confirm write picks up the new dates and the review row can
    // show old → new.
    if (iepDatesResult) {
      preview.iepDates = iepDatesResult.iepDates;
    }

    studentPreviews.push(preview);
  }

  return { studentPreviews, matchedDeliveryNames, matchedClassListNames, matchedIepDatesNames };
}

/**
 * Build a normalized-name -> joined student lookup for the update-only path.
 * Only students with both first and last names are keyed. Verbatim.
 */
export function buildStudentsByName(
  dbStudents: JoinedExistingStudent[]
): Map<string, JoinedExistingStudent> {
  const studentsByName = new Map<string, JoinedExistingStudent>();
  for (const student of dbStudents) {
    const details = student.student_details as unknown as { first_name: string | null; last_name: string | null } | null;
    if (details?.first_name && details?.last_name) {
      const normalizedKey = createNormalizedKey(details.first_name, details.last_name);
      studentsByName.set(normalizedKey, student);
    }
  }
  return studentsByName;
}

export interface UpdatePreviewResult {
  studentUpdates: StudentUpdate[];
  matchedDeliveryNames: Set<string>;
  matchedClassListNames: Set<string>;
  matchedIepDatesNames: Set<string>;
  unmatchedStudents: UnmatchedStudent[];
}

/**
 * Deliveries/class-list/IEP-dates "update-only" path: the students file is
 * absent, so preview rows fall out of matching existing students by name against
 * the enrichment files. Deliveries/class-list matches are always an 'update'; an
 * IEP Dates match is an 'update' only when a date differs from what's stored, and
 * a 'skip' when its dates already match (SPE-303 — no phantom updates).
 */
export function buildUpdatePreviews(params: {
  studentsByName: Map<string, JoinedExistingStudent>;
  deliveriesData: Map<string, DeliveryRecord> | null;
  classListData: Map<string, ClassListStudent> | null;
  iepDatesData?: Map<string, IepDatesRecord> | null;
  dbTeachers: DbTeacherRow[];
}): UpdatePreviewResult {
  const { studentsByName, deliveriesData, classListData, iepDatesData = null, dbTeachers } = params;

  const studentUpdates: StudentUpdate[] = [];
  const matchedDeliveryNames = new Set<string>();
  const matchedClassListNames = new Set<string>();
  const matchedIepDatesNames = new Set<string>();
  const unmatchedStudents: UnmatchedStudent[] = [];

  // Match deliveries to existing students
  if (deliveriesData) {
    for (const [normalizedName, record] of deliveriesData) {
      const existingStudent = studentsByName.get(normalizedName);
      if (existingStudent) {
        matchedDeliveryNames.add(normalizedName);
        const details = existingStudent.student_details as unknown as { first_name: string; last_name: string };

        // Find or create update entry
        let update = studentUpdates.find(u => u.studentId === existingStudent.id);
        if (!update) {
          update = {
            studentId: existingStudent.id,
            initials: existingStudent.initials || '',
            firstName: details.first_name,
            lastName: details.last_name,
            gradeLevel: existingStudent.grade_level,
            action: 'update'
          };
          studentUpdates.push(update);
        }

        update.schedule = {
          sessionsPerWeek: record.sessionsPerWeek,
          minutesPerSession: record.minutesPerSession,
          weeklyMinutes: record.weeklyMinutes,
          frequency: record.sessionsFrequency
        };
      } else {
        unmatchedStudents.push({
          name: record.name,
          source: 'deliveries'
        });
      }
    }
  }

  // Match class list to existing students
  if (classListData) {
    for (const [normalizedName, student] of classListData) {
      const existingStudent = studentsByName.get(normalizedName);
      if (existingStudent) {
        matchedClassListNames.add(normalizedName);
        const details = existingStudent.student_details as unknown as { first_name: string; last_name: string };

        // Find or create update entry
        let update = studentUpdates.find(u => u.studentId === existingStudent.id);
        if (!update) {
          update = {
            studentId: existingStudent.id,
            initials: existingStudent.initials || '',
            firstName: details.first_name,
            lastName: details.last_name,
            gradeLevel: existingStudent.grade_level,
            action: 'update'
          };
          studentUpdates.push(update);
        }

        // Match teacher to database
        const teacherMatch = resolveClassListTeacher(student.teacher, dbTeachers);

        update.teacher = {
          teacherId: teacherMatch.teacherId,
          teacherName: teacherMatch.teacherName,
          confidence: teacherMatch.confidence,
          reason: teacherMatch.reason
        };
      } else {
        unmatchedStudents.push({
          name: student.name,
          source: 'classList'
        });
      }
    }
  }

  // Match IEP Dates to existing students (SPE-303). File wins: a present date
  // overwrites the stored one. A row whose dates already match is left as a skip
  // below (no phantom update).
  if (iepDatesData) {
    for (const [normalizedName, record] of iepDatesData) {
      const existingStudent = studentsByName.get(normalizedName);
      if (!existingStudent) {
        unmatchedStudents.push({
          name: `${record.firstName} ${record.lastName}`.trim() || record.normalizedName,
          source: 'iepDates',
        });
        continue;
      }
      matchedIepDatesNames.add(normalizedName);
      const details = existingStudent.student_details as unknown as {
        first_name: string;
        last_name: string;
        upcoming_iep_date?: string | null;
        upcoming_triennial_date?: string | null;
      };
      const iepDatesResult = buildIepDatesPreview(
        record,
        details.upcoming_iep_date ?? null,
        details.upcoming_triennial_date ?? null,
      );
      // Matched but the file carried no usable date for this student — nothing to
      // enrich, and no row unless another file already made one.
      if (!iepDatesResult) continue;

      let update = studentUpdates.find(u => u.studentId === existingStudent.id);
      if (!update) {
        update = {
          studentId: existingStudent.id,
          initials: existingStudent.initials || '',
          firstName: details.first_name,
          lastName: details.last_name,
          gradeLevel: existingStudent.grade_level,
          action: 'update',
        };
        studentUpdates.push(update);
      }
      update.iepDates = iepDatesResult.iepDates;
    }
  }

  // Resolve each row's action. Deliveries/class-list contributions are always a
  // change; an IEP Dates contribution is a change only when a date differs from
  // what's stored. A row with nothing changed (an IEP-dates-only match whose
  // dates already match) becomes a skip so it isn't a phantom update (SPE-303).
  for (const update of studentUpdates) {
    const iepChanged = !!(
      update.iepDates?.upcomingIepDate?.changed || update.iepDates?.upcomingTriennialDate?.changed
    );
    const hasWork = !!update.schedule || !!update.teacher || iepChanged;
    update.action = hasWork ? 'update' : 'skip';
  }

  return { studentUpdates, matchedDeliveryNames, matchedClassListNames, matchedIepDatesNames, unmatchedStudents };
}

/** Roster-template existing-student row shape (initials+grade dedup). */
export interface RosterExistingStudentRow {
  id: string;
  initials: string | null;
  grade_level: string | null;
  school_id: string | null;
  sessions_per_week: number | null;
  minutes_per_session: number | null;
  teacher_id: string | null;
}

/**
 * Speddy roster-template path: dedup by initials+grade, resolve the inline
 * teacher against the school's teachers, and classify insert/update/skip via
 * classifyRosterChange. Verbatim.
 */
export function buildRosterPreviews(params: {
  students: CsvParsedStudent[];
  dbStudents: RosterExistingStudentRow[];
  currentSchoolId: string | null;
  dbTeachers: DbTeacherRow[];
}): StudentPreview[] {
  const { students, dbStudents, currentSchoolId, dbTeachers } = params;

  // Existing students keyed by the same initials+grade key the confirm route
  // dedups on, so a re-import updates in place instead of duplicating. Scoped to
  // the active school: a roster row is keyed only by initials+grade (no names),
  // so for a multi-school provider an unscoped match could update a same-initials
  // student at a different school.
  // Null school_id / empty currentSchoolId collapse to one bucket, matching the
  // main path and the confirm dedup key (buildSchoolScopedDedupKey).
  const existingByKey = new Map<string, RosterExistingStudentRow>();
  for (const s of dbStudents) {
    if ((s.school_id ?? '') !== (currentSchoolId ?? '')) continue;
    existingByKey.set(buildStudentDedupKey(s.initials, s.grade_level), s);
  }

  const studentPreviews: StudentPreview[] = [];

  for (const student of students) {
    const existing = existingByKey.get(buildStudentDedupKey(student.initials, student.gradeLevel));

    const { lastName, firstInitial } = parseTeacherName(student.teacherName || '');
    const teacherInfo: TeacherInfo = {
      rawName: student.teacherName || '',
      lastName,
      firstInitial,
      teacherNumber: ''
    };
    const teacherMatch = matchTeacher(teacherInfo, dbTeachers);
    const teacher: TeacherMatch = {
      teacherId: teacherMatch.teacherId,
      teacherName: teacherMatch.teacherName || teacherInfo.rawName || null,
      confidence: teacherMatch.confidence,
      reason: teacherMatch.reason
    };

    const schedule: ScheduleData | undefined =
      student.sessionsPerWeek && student.minutesPerSession
        ? {
            sessionsPerWeek: student.sessionsPerWeek,
            minutesPerSession: student.minutesPerSession,
            weeklyMinutes: student.sessionsPerWeek * student.minutesPerSession,
            frequency: `${student.sessionsPerWeek}x/week`
          }
        : undefined;

    // Insert vs update/skip by the initials+grade key. Only a resolved teacher
    // that differs counts as a change, so an unmatched teacher name never clears
    // an existing teacher link on re-import (see classifyRosterChange).
    const { action, scheduleChanged, teacherChanged } = classifyRosterChange(
      existing
        ? {
            sessions_per_week: existing.sessions_per_week,
            minutes_per_session: existing.minutes_per_session,
            teacher_id: existing.teacher_id
          }
        : undefined,
      teacher.teacherId,
      schedule ? { sessionsPerWeek: schedule.sessionsPerWeek, minutesPerSession: schedule.minutesPerSession } : undefined
    );

    let changes: StudentChanges | undefined;
    if (action === 'update') {
      changes = {};
      if (scheduleChanged && schedule) {
        changes.schedule = {
          old:
            existing && (existing.sessions_per_week || existing.minutes_per_session)
              ? {
                  sessionsPerWeek: existing.sessions_per_week ?? undefined,
                  minutesPerSession: existing.minutes_per_session ?? undefined
                }
              : null,
          new: { sessionsPerWeek: schedule.sessionsPerWeek, minutesPerSession: schedule.minutesPerSession }
        };
      }
      if (teacherChanged) {
        let existingTeacherName: string | undefined;
        if (existing?.teacher_id) {
          const t = dbTeachers.find((dt) => dt.id === existing.teacher_id);
          if (t) existingTeacherName = [t.first_name, t.last_name].filter(Boolean).join(' ');
        }
        changes.teacher = {
          old: existing?.teacher_id ? { teacherId: existing.teacher_id, teacherName: existingTeacherName } : null,
          new: { teacherId: teacher.teacherId, teacherName: teacher.teacherName }
        };
      }
    }

    const preview: StudentPreview = {
      firstName: '',
      lastName: '',
      initials: student.initials,
      gradeLevel: student.gradeLevel,
      goals: [],
      action,
      matchedStudentId: existing?.id,
      matchedStudentInitials: existing?.initials || undefined,
      matchConfidence: undefined,
      matchReason: existing ? 'Matched by initials and grade' : undefined,
      changes,
      goalsRemoved: undefined
    };
    if (schedule) preview.schedule = schedule;
    preview.teacher = teacher;

    studentPreviews.push(preview);
  }

  return studentPreviews;
}
