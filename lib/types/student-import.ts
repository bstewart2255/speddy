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
export type PreviewFileKey = 'studentsFile' | 'deliveriesFile' | 'classListFile';

export interface BulkGoal {
  text: string;
}

export interface BulkGoalChange {
  added: string[];
  removed: string[];
  unchanged: string[];
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
  unmatchedStudents?: Array<{ name: string; source: 'deliveries' | 'classList' }>;
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
  gradeLevel: string;
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
  /** Defaults to 'insert' server-side for backward compatibility. */
  action?: RowAction;
  /** Required for the 'update' action. */
  studentId?: string;
}
