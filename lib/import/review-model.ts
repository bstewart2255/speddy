/**
 * Normalized review model for the student-import review screen (SPE-227).
 *
 * The preview API returns four different payload shapes (main SEIS path,
 * deliveries/class-list "update" mode, roster template, and the per-student IEP
 * `matches` shape). Rather than teach the review UI all four, each wire payload
 * is converted into this one `ReviewModel` by a pure adapter. The bulk adapter
 * lives here; the per-student adapter (`adaptTargetStudentPreview`) arrives with
 * SPE-232. Keeping this server-agnostic and adapter-driven is the "data contract
 * before the per-flow reuse" gate.
 */

import type {
  RowAction,
  PreviewFileKey,
  BulkStudentPreview,
  BulkPreviewData,
  TargetPreviewData,
} from '@/lib/types/student-import';

// The preview/confirm wire contract lives in one shared module so the route
// (producer) and this adapter (consumer) can't drift (SPE-236). Re-exported
// here so existing importers of these names from this module keep working.
export type {
  RowAction,
  PreviewFileKey,
  BulkGoal,
  BulkStudentPreview,
  BulkFileReceipt,
  BulkPreviewData,
  TargetMatch,
  TargetPreviewData,
} from '@/lib/types/student-import';

// One confidence vocabulary, rendered identically everywhere (✓ · ! · −).
export type ReviewSignal = 'confident' | 'check' | 'removed';

export type ReviewMode = 'bulk' | 'target-student';
// bulk import replaces a student's goals; per-student IEP import merges (SPE-232/234).
export type WriteMode = 'replace' | 'merge';

export interface ReviewGoal {
  /** Verbatim goal text (SPE-238). */
  text: string;
  /** `added` = new to this student · `unchanged` = already present on an update. */
  status: 'added' | 'unchanged';
}

export interface ReviewTeacher {
  teacherId: string | null;
  teacherName: string | null;
  signal: ReviewSignal;
  reason: string;
}

export interface ReviewRow {
  /** Stable key: the matched student id, else `new:${srcIndex}`. */
  id: string;
  /** Position in the source payload — used to map input-ordered confirm results back. */
  srcIndex: number;
  action: RowAction;
  firstName: string;
  lastName: string;
  /** "First Last", or the initials when the source has no name (roster template). */
  displayName: string;
  /** Editable in the UI, kept through confirm. */
  initials: string;
  gradeLevel: string;
  schedule?: { sessionsPerWeek: number; minutesPerSession: number };
  teacher?: ReviewTeacher;
  /** Incoming goals being imported (selectable). */
  goals: ReviewGoal[];
  /** Existing goals dropped by an update's replace — shown struck-through + in the exceptions queue. */
  goalsRemoved: string[];
  /** Matched student id for updates (matchedStudentId ?? studentId). */
  targetStudentId?: string;
  matchConfidence?: 'high' | 'medium' | 'low' | 'none';
  matchReason?: string;
  /** Incoming IEP date from a per-student goals report (target-student mode,
   *  SPE-232) — written to goals_iep_date on import. Absent in bulk mode. */
  iepDate?: string;
}

export interface ReviewFileReceipt {
  fileKey: PreviewFileKey;
  /** e.g. "Student & goals report". */
  label: string;
  /** What this file fills in, e.g. "students & IEP goals". */
  fills: string;
  fileName: string;
  read: number;
  matched: number;
  filtered: number;
  /** Parse notes (skipped rows etc.) — demoted to a tertiary link in the receipt. */
  notes: Array<{ row: number; message: string }>;
}

export type ReviewException =
  | { kind: 'unmatched-student'; name: string; source: 'deliveries' | 'classList'; reason?: string }
  | { kind: 'low-confidence-teacher'; rowId: string; studentLabel: string; suggestion: ReviewTeacher }
  | { kind: 'goals-removed'; rowId: string; studentLabel: string; goals: string[] };

export interface ReviewSummary {
  totalStudents: number;
  inserts: number;
  updates: number;
  skips: number;
  totalGoals: number;
  filteredOutBySchool?: number;
  filteredOutSchools?: string[];
}

export interface ReviewModel {
  mode: ReviewMode;
  writeMode: WriteMode;
  summary: ReviewSummary;
  files: ReviewFileReceipt[];
  exceptions: ReviewException[];
  rows: ReviewRow[];
}

// The bulk preview wire types (BulkStudentPreview, BulkPreviewData, …) and the
// target preview types further down are imported from @/lib/types/student-import
// (the single contract shared with the route). This adapter consumes them.

// Receipt display labels keyed by the multipart form key each file submits under.
const FILE_RECEIPT_META: Record<PreviewFileKey, { label: string; fills: string }> = {
  studentsFile: { label: 'Student & goals report', fills: 'students & IEP goals' },
  deliveriesFile: { label: 'Deliveries', fills: 'schedules' },
  classListFile: { label: 'Class list', fills: 'teachers' },
};

const normalizeGoal = (s: string) => s.trim().toLowerCase();

function toReviewTeacher(teacher: NonNullable<BulkStudentPreview['teacher']>): ReviewTeacher {
  const signal: ReviewSignal =
    teacher.confidence === 'high' || teacher.confidence === 'medium' ? 'confident' : 'check';
  return {
    teacherId: teacher.teacherId,
    teacherName: teacher.teacherName,
    signal,
    reason: teacher.reason,
  };
}

function toReviewRow(student: BulkStudentPreview, srcIndex: number): ReviewRow {
  const action: RowAction = student.action;
  const targetStudentId = student.matchedStudentId ?? student.studentId;

  const fullName = `${student.firstName} ${student.lastName}`.trim();
  const displayName = fullName || student.initials;

  const addedSet = new Set((student.changes?.goals?.added ?? []).map(normalizeGoal));
  const goals: ReviewGoal[] = (student.goals ?? []).map((goal) => ({
    text: goal.text,
    status:
      action === 'insert' || addedSet.has(normalizeGoal(goal.text)) ? 'added' : 'unchanged',
  }));

  const goalsRemoved = student.goalsRemoved ?? student.changes?.goals?.removed ?? [];

  // Only carry a teacher when there's a real match to show/resolve. A blank
  // teacher object (no id, no name) would otherwise surface as a "teacher needs
  // review" exception with nothing to review, and render as "Unknown" in the row.
  const teacher =
    student.teacher && (student.teacher.teacherId || student.teacher.teacherName?.trim())
      ? toReviewTeacher(student.teacher)
      : undefined;

  return {
    // Unique per source row. Two rows can match the same student (e.g. a goals
    // row and a deliveries row); keying on targetStudentId alone would collide
    // the React key and the selection state, so always disambiguate by srcIndex.
    id: `${targetStudentId ?? 'new'}:${srcIndex}`,
    srcIndex,
    action,
    firstName: student.firstName,
    lastName: student.lastName,
    displayName,
    initials: student.initials,
    gradeLevel: student.gradeLevel ?? '',
    schedule: student.schedule
      ? {
          sessionsPerWeek: student.schedule.sessionsPerWeek,
          minutesPerSession: student.schedule.minutesPerSession,
        }
      : undefined,
    teacher,
    goals,
    goalsRemoved,
    targetStudentId,
    matchConfidence: student.matchConfidence,
    matchReason: student.matchReason,
  };
}

/**
 * Convert a bulk preview payload (main SEIS path, deliveries/class-list update
 * mode, or roster template) into the normalized `ReviewModel`. Pure — no I/O.
 */
export function adaptBulkPreview(data: BulkPreviewData): ReviewModel {
  const rows = data.students.map((student, index) => toReviewRow(student, index));

  const files: ReviewFileReceipt[] = (data.files ?? []).map((file) => ({
    fileKey: file.fileKey,
    label: FILE_RECEIPT_META[file.fileKey].label,
    fills: FILE_RECEIPT_META[file.fileKey].fills,
    fileName: file.fileName,
    read: file.read,
    matched: file.matched,
    filtered: file.filtered,
    notes: file.notes ?? [],
  }));

  const exceptions: ReviewException[] = [];
  for (const unmatched of data.unmatchedStudents ?? []) {
    exceptions.push({ kind: 'unmatched-student', name: unmatched.name, source: unmatched.source });
  }
  for (const row of rows) {
    if (row.teacher && row.teacher.signal === 'check') {
      exceptions.push({
        kind: 'low-confidence-teacher',
        rowId: row.id,
        studentLabel: row.displayName,
        suggestion: row.teacher,
      });
    }
    if (row.goalsRemoved.length > 0) {
      exceptions.push({
        kind: 'goals-removed',
        rowId: row.id,
        studentLabel: row.displayName,
        goals: row.goalsRemoved,
      });
    }
  }

  const inserts = rows.filter((r) => r.action === 'insert').length;
  const updates = rows.filter((r) => r.action === 'update').length;
  const skips = rows.filter((r) => r.action === 'skip').length;
  const totalGoals = rows
    .filter((r) => r.action !== 'skip')
    .reduce((sum, r) => sum + r.goals.length, 0);

  return {
    mode: 'bulk',
    writeMode: 'replace',
    summary: {
      totalStudents: rows.length,
      inserts,
      updates,
      skips,
      totalGoals,
      filteredOutBySchool: data.summary.filteredOutBySchool,
      filteredOutSchools: data.summary.filteredOutSchools,
    },
    files,
    exceptions,
    rows,
  };
}

// The per-student IEP goals preview wire types (TargetMatch, TargetPreviewData)
// are imported from @/lib/types/student-import. One matched student whose goals
// merge into their record — nothing is removed (SPE-232).

/**
 * Convert a per-student IEP goals preview (the `/api/import-iep-goals` `matches`
 * shape) into the normalized `ReviewModel` in target-student mode. Merge
 * semantics: every incoming goal is an addition (`status: 'added'`), nothing is
 * ever removed, so `goalsRemoved` is always empty. Pure — no I/O.
 */
export function adaptTargetStudentPreview(data: TargetPreviewData): ReviewModel {
  const rows: ReviewRow[] = (data.matches ?? []).map((match, index) => ({
    id: `${match.studentId}:${index}`,
    srcIndex: index,
    action: 'update',
    firstName: '',
    lastName: '',
    // The IEP goals report exposes initials + grade for a match, not a name.
    displayName: match.studentInitials,
    initials: match.studentInitials,
    gradeLevel: match.studentGrade,
    goals: match.goals.map(goal => ({ text: goal.text, status: 'added' as const })),
    goalsRemoved: [],
    targetStudentId: match.studentId,
    matchConfidence: match.matchConfidence,
    matchReason: match.matchReason,
    iepDate: match.iepDate,
  }));

  const totalGoals = rows.reduce((sum, r) => sum + r.goals.length, 0);

  return {
    mode: 'target-student',
    writeMode: 'merge',
    summary: {
      totalStudents: rows.length,
      inserts: 0,
      updates: rows.length,
      skips: 0,
      totalGoals,
    },
    files: [],
    exceptions: [],
    rows,
  };
}
