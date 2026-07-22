/**
 * Shared wire contract for the student-import flows (SPE-236, ARCH-3/ARCH-5).
 *
 * Single source of truth for the preview/confirm payload types, imported by
 * BOTH the API routes (producers, via a `satisfies` binding on each response)
 * and the client review components (consumers). Because both sides reference
 * these types, renaming a field here breaks compilation on both — the
 * drift-detection guarantee that replaces the copies previously re-declared in
 * the route and the client adapter.
 *
 * The legacy per-row match-status field ('new' | 'duplicate') and the
 * `new`/`duplicates` summary counts are intentionally absent: the review UI
 * reads `action` ('insert' | 'update' | 'skip') only, so those compatibility
 * fields are gone (SPE-236).
 */

/** The UPSERT action for a preview row — the field the review UI keys off. */
export type RowAction = 'insert' | 'update' | 'skip';

/** Multipart form key each uploaded file submits under (also the receipt key). */
export type PreviewFileKey = 'studentsFile' | 'deliveriesFile' | 'classListFile' | 'iepDatesFile';

export interface BulkGoal {
  text: string;
}

export interface BulkGoalChange {
  added: string[];
  removed: string[];
  unchanged: string[];
}

/**
 * One IEP date coming from the SEIS "IEP Dates" report (SPE-303). `value` is the
 * new date being written (ISO YYYY-MM-DD, file wins); `old` is the stored date
 * being replaced (or null when none), so the review row can show old → new;
 * `changed` is `value !== old`. A field is present only when the file supplied a
 * parseable date for it, so the confirm write can be presence-keyed (an absent
 * date never nulls an existing one).
 */
export interface BulkIepDateChange {
  value: string;
  old: string | null;
  changed: boolean;
}

/** The two compliance dates the IEP Dates report fills in for a matched student. */
export interface IepDatesPreview {
  /** Date of Next Annual Plan Review → student_details.upcoming_iep_date. */
  upcomingIepDate?: BulkIepDateChange;
  /** Date of Next Reevaluation → student_details.upcoming_triennial_date. */
  upcomingTriennialDate?: BulkIepDateChange;
}

/**
 * One preview row on the wire, covering all bulk producer paths (main SEIS,
 * deliveries/class-list update mode, and roster template). Fields the review
 * screen doesn't consume are still carried by some producers; only the consumed
 * subset is modeled here.
 */
export interface BulkStudentPreview {
  firstName: string;
  lastName: string;
  initials: string;
  /** Nullable: deliveries/class-list update rows carry the DB grade, which can be null. */
  gradeLevel: string | null;
  goals?: BulkGoal[];
  action: RowAction;
  matchedStudentId?: string;
  matchedStudentInitials?: string;
  matchConfidence?: 'high' | 'medium' | 'low';
  matchReason?: string;
  /** Present in deliveries/class-list update mode instead of matchedStudentId. */
  studentId?: string;
  changes?: { goals?: BulkGoalChange };
  goalsRemoved?: string[];
  schedule?: { sessionsPerWeek: number; minutesPerSession: number };
  teacher?: {
    teacherId: string | null;
    teacherName: string | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string;
  };
  /** Present when the IEP Dates report (SPE-303) matched this student. */
  iepDates?: IepDatesPreview;
}

export interface BulkFileReceipt {
  fileKey: PreviewFileKey;
  fileName: string;
  read: number;
  matched: number;
  filtered: number;
  notes?: Array<{ row: number; message: string }>;
}

export interface BulkImportSummary {
  total: number;
  inserts?: number;
  updates?: number;
  skips?: number;
  withGoalsRemoved?: number;
  withSchedule?: number;
  withTeacher?: number;
  filteredOutBySchool?: number;
  filteredOutSchools?: string[];
}

/** The `data` payload returned by the bulk preview route (`/api/import-students`). */
export interface BulkPreviewData {
  students: BulkStudentPreview[];
  summary: BulkImportSummary;
  unmatchedStudents?: Array<{ name: string; source: 'deliveries' | 'classList' | 'iepDates' }>;
  parseErrors?: Array<{ row: number; message: string }>;
  parseWarnings?: Array<{ row: number; message: string; source?: string }>;
  files?: BulkFileReceipt[];
  mode?: 'update';
}

/** One matched student from the per-student IEP goals preview (`/api/import-iep-goals`). */
export interface TargetMatch {
  studentId: string;
  studentInitials: string;
  studentGrade: string;
  matchConfidence: 'high' | 'medium' | 'low';
  matchReason: string;
  /** IEP date from the report, carried through to the write (goals_iep_date). */
  iepDate?: string;
  goals: Array<{ text: string }>;
}

export interface TargetPreviewData {
  matches: TargetMatch[];
}

/** One row of the bulk confirm request (`/api/import-students/confirm`). */
export interface StudentToImport {
  firstName: string;
  lastName: string;
  /** User-edited initials from the review screen. */
  initials: string;
  /** Null for an update row whose existing student has no grade — the confirm
   *  RPC COALESCEs, so null leaves the stored grade untouched. */
  gradeLevel: string | null;
  /** Verbatim goal text, selected in the review screen. */
  goals: string[];
  schoolSite?: string;
  schoolId?: string;
  districtId?: string;
  stateId?: string;
  sessionsPerWeek?: number;
  minutesPerSession?: number;
  teacherId?: string;
  /** For updating the deprecated teacher_name column. */
  teacherName?: string;
  /**
   * IEP compliance dates from the SEIS "IEP Dates" report (SPE-303), ISO
   * YYYY-MM-DD. Presence-keyed: sent only when the file supplied a parseable
   * date, so the confirm RPC overwrites the stored value (file wins) on presence
   * and leaves it untouched on absence.
   */
  upcomingIepDate?: string;
  upcomingTriennialDate?: string;
  /** Defaults to 'insert' server-side for backward compatibility. */
  action?: RowAction;
  /** Required for the 'update' action. */
  studentId?: string;
}
