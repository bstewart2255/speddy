/**
 * Aeries SIS API — type definitions.
 *
 * Two layers live here:
 *  1. `Raw*` types mirror the JSON the Aeries native REST API (v5) returns,
 *     using Aeries' own PascalCase field names.
 *  2. The Speddy-facing mapped types (see `mappers.ts`) are the shapes the rest
 *     of the app consumes.
 *
 * Field names verified against the Aeries API documentation (v5):
 *  - Staff/Teacher endpoints: https://support.aeries.com/support/solutions/articles/14000113687
 *  - School endpoints:        https://support.aeries.com/support/solutions/articles/14000113682
 *  - Student endpoints:       https://support.aeries.com/support/solutions/articles/14000113683
 *
 * Aeries returns a permissive payload (extra fields, nulls). We only type the
 * fields we consume and keep an index signature so unknown fields don't break
 * parsing.
 */

/** A school record from `GET /schools` or `GET /schools/{SchoolCode}`. */
export interface RawAeriesSchool {
  SchoolCode: number;
  Name: string;
  InactiveStatusCode?: string;
  LowGradeLevel?: number;
  HighGradeLevel?: number;
  [key: string]: unknown;
}

/** A teacher record from `GET /schools/{SchoolCode}/teachers`. */
export interface RawAeriesTeacher {
  SchoolCode: number;
  TeacherNumber: number;
  DisplayName?: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Room?: string;
  LowGrade?: number;
  HighGrade?: number;
  StaffID1?: number;
  StaffID2?: number;
  StaffID3?: number;
  /** Non-empty / non-null marks an inactive teacher. */
  InactiveStatusCode?: string | null;
  [key: string]: unknown;
}

/** A student record from `GET /schools/{SchoolCode}/students`. */
export interface RawAeriesStudent {
  SchoolCode: number;
  StudentID: number;
  StudentNumber?: number;
  StateStudentID?: string;
  FirstName?: string;
  LastName?: string;
  MiddleName?: string;
  Grade?: number | string;
  Gender?: string;
  Birthdate?: string;
  /** Non-empty marks an inactive enrollment (e.g. "N"). */
  InactiveStatusCode?: string | null;
  [key: string]: unknown;
}

/**
 * A program record from `GET /schools/{SchoolCode}/students/{StudentID}/programs`.
 * Special Education is `ProgramCode` 144 (`144x` while a student is being
 * evaluated for, but not yet receiving, services).
 *
 * NOTE: the endpoint uses `ProgramCode`/`ProgramDescription` and split
 * eligibility/participation dates — not `Code`/`Name`/`StartDate`/`EndDate`.
 */
export interface RawAeriesProgram {
  StudentID: number;
  /** e.g. "144" (SpEd) or "144x" (being evaluated). */
  ProgramCode: string;
  ProgramDescription?: string;
  EligibilityStartDate?: string;
  EligibilityEndDate?: string;
  ParticipationStartDate?: string;
  ParticipationEndDate?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Speddy-facing mapped shapes
// ---------------------------------------------------------------------------

/** A teacher mapped to Speddy's `teachers` model (pre-insert). */
export interface MappedAeriesTeacher {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** Maps to `teachers.classroom_number`. */
  room: string | null;
  /** Aeries `LowGrade`/`HighGrade` — no column in Speddy yet (gap flagged). */
  lowGrade: number | null;
  highGrade: number | null;
  /** Stable Aeries identity for dedupe/differential sync (no column yet). */
  aeriesTeacherNumber: number;
  schoolCode: number;
  active: boolean;
}

/** A SpEd student mapped toward Speddy's `students` model (pre-insert). */
export interface MappedAeriesStudent {
  firstName: string | null;
  lastName: string | null;
  grade: string | null;
  /** Stable Aeries identity — intended join key for the Renaissance match. */
  aeriesStudentId: number;
  stateStudentId: string | null;
  schoolCode: number;
  /** True when the student's SpEd program code is the `144x` evaluation flag. */
  beingEvaluated: boolean;
  active: boolean;
}
