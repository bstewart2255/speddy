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
  /** The district's own student id carried by the file (SPE-339). */
  districtStudentId?: string;
  /** Set when that id is already on file against a different child (SPE-339).
   *  The id is withheld from the write and the clash is raised in the review
   *  queue for a human to resolve. */
  districtStudentIdConflict?: { districtStudentId: string; existingLabel: string };
  /** A child already served by another provider at this school that this NEW
   *  row looks like (SPE-348). An offer, never a decision: nothing links unless
   *  the importer says "same child". Only ever set on `action: 'insert'` rows. */
  childMatch?: ChildMatchOffer;
  /** Why no offer was made even though something was found (SPE-348) — an
   *  ambiguous match or a Student ID that points at a differently-named child.
   *  Reported in the review queue; the row imports as a separate child. */
  childMatchConflict?: ChildMatchConflict;
}

/** How an incoming row matched an existing child (SPE-348), strongest first. */
export type ChildMatchReason = 'district-student-id' | 'name-grade' | 'initials-grade-teacher';

/**
 * The "same child?" offer for one incoming row (SPE-348). Produced by the
 * `find_shared_child_candidates` RPC, which only ever offers an unambiguous,
 * uncontested match — so the review screen renders it as a straight yes/no.
 */
export interface ChildMatchOffer {
  childId: string;
  reason: ChildMatchReason;
  /** The child's grade, for the review copy ("a 5th grader"). */
  gradeLevel: string | null;
  /** The district Student ID that matched, when the match was made on one. */
  districtStudentId: string | null;
  /** The co-serving provider — name and role, per the owner's 2026-07-29 call. */
  providerName: string | null;
  providerRole: string | null;
}

export interface ChildMatchConflict {
  kind: 'ambiguous' | 'id-name-disagreement';
  /** How many children could be this student. Only set for 'ambiguous'. */
  count?: number;
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
  /**
   * The district's own student id (SPE-339). Presence-keyed like the dates
   * above: sent only when the file carried one and it was not disputed, so an
   * import without ids never erases a stored id.
   */
  districtStudentId?: string;
  /**
   * The child the importer confirmed this new student IS (SPE-348). Sent only
   * after an explicit "same child" click on an offer the preview made, and only
   * on an insert row. The server re-validates it against the same matcher before
   * honouring it, so this is a claim, not an instruction.
   */
  confirmedChildId?: string;
  /** Defaults to 'insert' server-side for backward compatibility. */
  action?: RowAction;
  /** Required for the 'update' action. */
  studentId?: string;
}
