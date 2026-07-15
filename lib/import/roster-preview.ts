/**
 * Pure classification for the roster-template import preview (SPE-225).
 *
 * Given an existing student (if any) and the roster row's resolved teacher +
 * inline schedule, decide insert vs update vs skip and which fields changed.
 * Kept pure and separate from the API route so this compliance-relevant
 * create-vs-merge decision is unit-tested.
 */

export interface RosterExistingState {
  sessions_per_week: number | null;
  minutes_per_session: number | null;
  teacher_id: string | null;
}

export interface RosterScheduleInput {
  sessionsPerWeek: number;
  minutesPerSession: number;
}

export interface RosterClassification {
  action: 'insert' | 'update' | 'skip';
  scheduleChanged: boolean;
  teacherChanged: boolean;
}

/**
 * @param existing         The matched existing student's current state, or
 *                         undefined for a brand-new student.
 * @param resolvedTeacherId The teacher_id the roster's teacher name resolved to,
 *                         or null when it didn't match a school teacher.
 * @param schedule         The roster row's inline schedule, if present.
 */
export function classifyRosterChange(
  existing: RosterExistingState | undefined,
  resolvedTeacherId: string | null,
  schedule: RosterScheduleInput | undefined
): RosterClassification {
  if (!existing) {
    return { action: 'insert', scheduleChanged: false, teacherChanged: false };
  }

  const scheduleChanged =
    !!schedule &&
    (existing.sessions_per_week !== schedule.sessionsPerWeek ||
      existing.minutes_per_session !== schedule.minutesPerSession);

  // Only a RESOLVED teacher that differs counts as a change. An unmatched teacher
  // name (resolvedTeacherId === null) must never be treated as "teacher changed",
  // or a re-import with a typo'd/unknown teacher would clear the student's
  // existing teacher link.
  const teacherChanged = resolvedTeacherId !== null && existing.teacher_id !== resolvedTeacherId;

  return {
    action: scheduleChanged || teacherChanged ? 'update' : 'skip',
    scheduleChanged,
    teacherChanged,
  };
}
