/**
 * Producer-internal types for the bulk student-import preview pipeline (SPE-230).
 *
 * These describe the shapes the preview route builds internally. The final
 * response is still bound to the shared wire contract in
 * `lib/types/student-import.ts` via a `satisfies BulkPreviewData` in the route,
 * so these are the richer producer views (some fields are carried but not
 * consumed by the review UI).
 */
import type { DatabaseStudent } from '@/lib/utils/student-matcher';

/** Awaited server Supabase client type, without a runtime import of the module. */
export type ImportSupabaseClient = Awaited<
  ReturnType<typeof import('@/lib/supabase/server').createClient>
>;

/** Teacher rows fetched for class-list / roster teacher matching. */
export type DbTeacherRow = { id: string; first_name: string | null; last_name: string | null };

export interface TeacherMatch {
  teacherId: string | null;
  teacherName: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

export interface ScheduleData {
  sessionsPerWeek: number;
  minutesPerSession: number;
  weeklyMinutes: number;
  frequency: string;
}

export interface GoalChange {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface ScheduleChange {
  old: { sessionsPerWeek?: number; minutesPerSession?: number } | null;
  new: { sessionsPerWeek: number; minutesPerSession: number } | null;
}

export interface TeacherChange {
  old: { teacherId?: string; teacherName?: string } | null;
  new: { teacherId: string | null; teacherName: string | null } | null;
}

/**
 * A student's full name being added on an enrichment update (SPE-284). Today
 * only used to fill an existing initials-only record's empty name — `old` is
 * therefore always null; the field exists so the review can show the name that
 * will be added.
 */
export interface NameChange {
  old: string | null;
  new: string | null;
}

export interface StudentChanges {
  goals?: GoalChange;
  schedule?: ScheduleChange;
  teacher?: TeacherChange;
  name?: NameChange;
}

/** A preview row from the main SEIS path and the roster-template path. */
export interface StudentPreview {
  firstName: string;
  lastName: string;
  initials: string; // Generated, but editable in UI
  gradeLevel: string;
  // Imported goals are stored verbatim (SPE-238).
  goals: Array<{ text: string }>;
  // UPSERT action: insert (new), update (existing with changes), skip (existing, no changes)
  action: 'insert' | 'update' | 'skip';
  matchedStudentId?: string; // If duplicate/update, the ID of existing student
  matchedStudentInitials?: string; // If duplicate/update, the initials of existing student
  matchConfidence?: 'high' | 'medium' | 'low'; // If duplicate/update, confidence level
  matchReason?: string; // If duplicate/update, reason for match
  // Changes tracking for updates
  changes?: StudentChanges;
  // Warning if goals are being removed
  goalsRemoved?: string[];
  // New fields from Deliveries file
  schedule?: ScheduleData;
  // New fields from Class List file
  teacher?: TeacherMatch;
}

/**
 * A preview row from the deliveries/class-list update-only path. Distinct from
 * StudentPreview: it carries `studentId` (not matchedStudentId), a null-able
 * grade (the DB grade), no goals, and is always an 'update'.
 */
export interface StudentUpdate {
  studentId: string;
  initials: string;
  firstName: string;
  lastName: string;
  gradeLevel: string | null;
  action: 'update'; // Always 'update' for Deliveries/ClassList-only mode
  schedule?: {
    sessionsPerWeek: number;
    minutesPerSession: number;
    weeklyMinutes: number;
    frequency: string;
  };
  teacher?: {
    teacherId: string | null;
    teacherName: string | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string;
  };
}

export interface UnmatchedStudent {
  name: string;
  source: 'deliveries' | 'classList';
}

/**
 * The joined existing-student row the update-only path selects
 * (`student_details!inner(first_name, last_name)`). The embedded relation is
 * typed loosely because Supabase returns it as an untyped nested object.
 */
export interface JoinedExistingStudent {
  id: string;
  initials: string | null;
  grade_level: string | null;
  school_site: string | null;
  school_id: string | null;
  student_details: unknown;
}

/** Re-exported so pipeline modules share one DatabaseStudent definition. */
export type { DatabaseStudent };
