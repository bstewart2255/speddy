/**
 * CSV IEP Goals Parser
 * Parses CSV files to extract student IEP goals
 */

import { parse } from 'csv-parse/sync';
import { TextDecoder } from 'util';
import { normalizeSchoolName } from '../school-helpers';
import { getServiceTypeCode, getServiceTypeNameForRole, isGoalForProviderByKeywords, hasNoProviderRoutingSignal } from './service-type-mapping';
import { normalizeGradeLevel } from '../utils/grade-parser';
import { buildStudentDedupKey, normalizeInitialsForKey } from '../utils/student-dedup-key';

export interface ParsedStudent {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  schoolOfAttendance?: string; // School of Attendance (SEIS Column G)
  iepDate?: string; // IEP Date (SEIS Column J) - for validation warnings
  goals: string[];
  rawRow: number; // For debugging
  // Speddy roster template only (SPE-225): the template carries the teacher name
  // and schedule inline (no goals, no names). Undefined for SEIS/generic rows.
  teacherName?: string;
  sessionsPerWeek?: number;
  minutesPerSession?: number;
}

export interface ParseResult {
  students: ParsedStudent[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  metadata: {
    totalRows: number;
    columnsDetected: string[];
    formatDetected?: 'seis-student-goals' | 'generic' | 'speddy-template';
    goalsFiltered?: number; // Number of goals filtered out (SEIS only)
    targetStudentFound?: boolean; // Whether target student was found (when targetStudent filter is used)
  };
}

interface ColumnMapping {
  firstName?: number;
  lastName?: number;
  grade?: number;
  schoolOfAttendance?: number; // School of Attendance (SEIS Column G)
  iepDate?: number; // IEP Date (SEIS Column J) - for validation warnings
  areaOfNeed?: number; // Area of Need (SEIS Column L) - used for filtering
  goalType?: number; // Annual Goal # (SEIS Column M) - used for filtering
  personResponsible?: number; // Person Responsible (SEIS Column R) - used for filtering
  goalColumns: number[];
}

export interface ParseOptions {
  userSchools?: string[]; // School names user is associated with (for verification)
  targetStudent?: {
    initials: string;
    gradeLevel: string;
    schoolName: string;
    firstName?: string;
    lastName?: string;
  }; // If provided, only parse goals for this specific student
  providerRole?: string; // Provider's role for service type filtering (resource, speech, ot, counseling)
}

/**
 * Parse CSV file and extract student IEP goals
 */
export async function parseCSVReport(buffer: Buffer, options: ParseOptions = {}): Promise<ParseResult> {
  const students: ParsedStudent[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];
  let goalsFiltered = 0;

  try {
    // Parse CSV with various encoding attempts
    let records: string[][];

    // Shared across the UTF-8 attempt and both latin1 fallbacks below.
    // bom: true is required — SEIS exports its Student Goals Report CSV with a
    // UTF-8 BOM and a quoted first header cell; without stripping the BOM,
    // csv-parse throws INVALID_OPENING_QUOTE and the whole file is rejected.
    const parseOptions = {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    };

    // Choose the encoding from the raw bytes. csv-parse substitutes U+FFFD for
    // invalid UTF-8 instead of throwing, so it can't distinguish a UTF-8 file
    // from a latin1 / Windows-1252 re-save (e.g. "Muñoz" saved with byte 0xF1).
    // Probe the buffer: if it is NOT valid UTF-8, decode as latin1, under which
    // those single high bytes map to the intended characters. Crucially, a file
    // that IS valid UTF-8 stays UTF-8 even when it legitimately contains a
    // U+FFFD character — so correctly-encoded multibyte text is never garbled by
    // a false-positive retry (checking the decoded output for U+FFFD couldn't
    // tell a real replacement char from a substituted one).
    let encoding: BufferEncoding = 'utf-8';
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      encoding = 'latin1';
    }

    try {
      records = parse(buffer, { encoding, ...parseOptions });
    } catch (e) {
      // Last-resort fallback for any other hard parse/decoding error.
      records = parse(buffer, { encoding: 'latin1', ...parseOptions });
    }

    if (records.length === 0) {
      throw new Error('CSV file is empty');
    }

    // SPE-225: the simple Speddy roster template (Initials/Grade/Teacher +
    // optional schedule, no goals) flows through this same preview/confirm
    // pipeline as SEIS files, so it gains first-class records (real teacher_id,
    // dedupe, preview) instead of the old browser-side write. Checked before
    // SEIS/generic detection since it has no goal column of its own.
    if (detectSpeddyTemplateFormat(records)) {
      return parseSpeddyTemplateRows(records);
    }

    // Detect column mapping from headers
    const columnMapping = detectColumnMapping(records);
    const columnsDetected = records[0] || [];

    // Detect if this is a SEIS Student Goals Report
    const isSEISFormat = detectSEISStudentGoalsFormat(records);
    const formatDetected = isSEISFormat ? 'seis-student-goals' : 'generic' as const;

    if (!columnMapping.firstName || !columnMapping.lastName || !columnMapping.grade) {
      // A file carrying the roster template's signature `Initials` column and NO
      // name columns is a roster attempt with a missing/misnamed required column
      // — give the roster requirement rather than the SEIS/generic name-column
      // guidance (SPE-250). Guard on the name columns being absent so a genuine
      // name-based file that merely also carries an Initials column (or whose
      // First/Last/Grade column sits at index 0 — a pre-existing falsy-index
      // quirk in detectColumnMapping's `!mapping.x` checks) still gets the name
      // guidance rather than a misleading "looks like the roster template".
      const looksLikeRoster =
        columnMapping.firstName === undefined && columnMapping.lastName === undefined;
      const rosterHint = looksLikeRoster ? describeIncompleteRosterTemplate(records) : null;
      errors.push({
        row: 0,
        message: rosterHint
          ? rosterHint
          : isSEISFormat
          ? 'SEIS Student Goals Report detected but could not find expected columns (Last Name, First Name, Grade)'
          : 'Could not detect student name or grade columns. Looking for columns like: First Name, Last Name, Grade, Student Name.'
      });

      return {
        students,
        errors,
        warnings,
        metadata: {
          totalRows: records.length,
          columnsDetected,
          formatDetected
        }
      };
    }

    if (columnMapping.goalColumns.length === 0) {
      errors.push({
        row: 0,
        message: isSEISFormat
          ? 'SEIS Student Goals Report detected but could not find Goal column (Column O)'
          : 'Could not detect IEP goal columns. Looking for columns containing: Goal, IEP, Objective, Target.'
      });

      return {
        students,
        errors,
        warnings,
        metadata: {
          totalRows: records.length,
          columnsDetected,
          formatDetected
        }
      };
    }

    // Temporary map to consolidate duplicate students
    const studentMap = new Map<string, ParsedStudent>();

    // Process each row (skip header row)
    for (let rowIndex = 1; rowIndex < records.length; rowIndex++) {
      const row = records[rowIndex];

      try {
        const firstName = row[columnMapping.firstName] || '';
        const lastName = row[columnMapping.lastName] || '';
        const grade = row[columnMapping.grade] || '';
        const schoolOfAttendance = columnMapping.schoolOfAttendance !== undefined ? row[columnMapping.schoolOfAttendance] || '' : '';
        const iepDateRaw = columnMapping.iepDate !== undefined ? row[columnMapping.iepDate] || '' : '';

        // Skip rows without student data
        if (!firstName.trim() || !lastName.trim() || !grade.trim()) {
          continue;
        }

        // Generate initials early for target matching
        const initials = `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
        const normalizedGrade = normalizeGradeLevel(grade);

        // Parse IEP date to ISO format if present
        const iepDate = iepDateRaw ? parseDate(iepDateRaw) : undefined;

        // If target student specified, filter to only that student
        if (options.targetStudent) {
          const { targetStudent } = options;

          // Check initials match
          if (initials !== targetStudent.initials) {
            continue;
          }

          // Check grade match. Normalize the target's stored grade too: it
          // comes straight from students.grade_level, which for rows written by
          // the pre-SPE-240 parser can be a legacy value ('First', '18', '0')
          // that must reconcile with the row's canonical grade (SPE-240).
          if (normalizedGrade !== normalizeGradeLevel(targetStudent.gradeLevel)) {
            continue;
          }

          // Check school match (fuzzy)
          // CRITICAL: For single-student targeting, school matching is required to prevent false positives
          if (schoolOfAttendance && targetStudent.schoolName) {
            const schoolMatches = normalizeSchoolName(schoolOfAttendance).includes(normalizeSchoolName(targetStudent.schoolName)) ||
                                 normalizeSchoolName(targetStudent.schoolName).includes(normalizeSchoolName(schoolOfAttendance));

            if (!schoolMatches) {
              continue;
            }
          } else if (!schoolOfAttendance && targetStudent.schoolName) {
            // CSV has no school column but we're targeting specific student - warn and skip
            warnings.push({
              row: rowIndex + 1,
              message: `CSV missing school column. Cannot verify if student "${firstName} ${lastName}" attends "${targetStudent.schoolName}". Skipping for safety.`
            });
            continue;
          } else if (schoolOfAttendance && !targetStudent.schoolName) {
            // Target student has no school data but CSV has school - warn and skip for safety
            warnings.push({
              row: rowIndex + 1,
              message: `Target student has no school data, but CSV shows "${schoolOfAttendance}". Skipping to prevent incorrect match.`
            });
            continue;
          }

          // Bonus validation: check names if provided
          if (targetStudent.firstName && targetStudent.lastName) {
            const firstNameMatch = firstName.trim().toLowerCase() === targetStudent.firstName.toLowerCase();
            const lastNameMatch = lastName.trim().toLowerCase() === targetStudent.lastName.toLowerCase();

            if (!firstNameMatch || !lastNameMatch) {
              warnings.push({
                row: rowIndex + 1,
                message: `Found student with matching initials (${initials}), grade (${normalizedGrade}), and school, but name mismatch: CSV has "${firstName} ${lastName}", expected "${targetStudent.firstName} ${targetStudent.lastName}". Using CSV student.`
              });
            }
          }
        }

        // For SEIS format, check school verification if user has multiple schools
        if (isSEISFormat && schoolOfAttendance && options.userSchools && options.userSchools.length > 0) {
          const schoolMatches = options.userSchools.some(userSchool =>
            normalizeSchoolName(schoolOfAttendance).includes(normalizeSchoolName(userSchool)) ||
            normalizeSchoolName(userSchool).includes(normalizeSchoolName(schoolOfAttendance))
          );

          if (!schoolMatches) {
            warnings.push({
              row: rowIndex + 1,
              message: `Student "${firstName} ${lastName}" attends "${schoolOfAttendance}" which doesn't match your school(s). Skipping.`
            });
            continue;
          }
        }

        // Extract goals from goal columns
        const goals: string[] = [];

        // Get provider-related columns for filtering (SEIS Student Goals Report)
        const areaOfNeed = columnMapping.areaOfNeed !== undefined ? row[columnMapping.areaOfNeed] || '' : '';
        const goalType = columnMapping.goalType !== undefined ? row[columnMapping.goalType] || '' : '';
        const personResponsible = columnMapping.personResponsible !== undefined ? row[columnMapping.personResponsible] || '' : '';

        // A SEIS goal row with blank Area of Need, Annual Goal #, AND Person
        // Responsible has no signal to route it to any provider. Under keyword
        // filtering it would silently vanish for every keyworded role; surface
        // it for manual review instead (SPE-247). Psychologist/specialist roles
        // have no service code and import everything, so they're unaffected.
        if (
          isSEISFormat &&
          options.providerRole &&
          getServiceTypeCode(options.providerRole) !== null &&
          hasNoProviderRoutingSignal(areaOfNeed, goalType, personResponsible)
        ) {
          const hasGoalText = columnMapping.goalColumns.some(
            (i) => (row[i] || '').trim().length > 10
          );
          if (hasGoalText) {
            warnings.push({
              row: rowIndex + 1,
              message: `Goal for student ${initials} (grade ${normalizedGrade}) has no Area of Need, Annual Goal #, or Person Responsible and could not be routed to a provider — please review and assign it manually.`,
            });
          }
        }

        for (const goalColIndex of columnMapping.goalColumns) {
          const goalText = row[goalColIndex] || '';

          // For SEIS format, filter by provider role using multiple columns
          if (isSEISFormat && options.providerRole) {
            if (!isGoalForProvider(areaOfNeed, goalType, personResponsible, options.providerRole)) {
              goalsFiltered++;
              continue; // Skip goals that don't match provider's type
            }
          }

          if (goalText.trim().length > 10) {
            goals.push(goalText.trim());
          }
        }

        // Only process if they have at least one goal
        if (goals.length === 0) {
          continue;
        }

        // Create unique key for student (name + grade)
        const studentKey = `${firstName.trim().toLowerCase()}_${lastName.trim().toLowerCase()}_${normalizedGrade}`;

        // Check if student already exists
        if (studentMap.has(studentKey)) {
          // Add goals to existing student (avoid duplicates)
          const existing = studentMap.get(studentKey)!;
          for (const goal of goals) {
            if (!existing.goals.includes(goal)) {
              existing.goals.push(goal);
            }
          }
          // Merge iepDate (keep first non-empty value)
          if (!existing.iepDate && iepDate) {
            existing.iepDate = iepDate;
          }
        } else {
          // Add new student
          studentMap.set(studentKey, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            initials,
            gradeLevel: normalizedGrade,
            schoolOfAttendance: schoolOfAttendance ? schoolOfAttendance.trim() : undefined,
            iepDate,
            goals,
            rawRow: rowIndex + 1
          });
        }
      } catch (error: any) {
        errors.push({
          row: rowIndex + 1,
          message: `Error parsing row: ${error.message}`
        });
      }
    }

    // Convert map to array
    students.push(...Array.from(studentMap.values()));

    // Check if target student was requested but not found
    if (options.targetStudent && students.length === 0) {
      errors.push({
        row: 0,
        message: `Target student not found in CSV: ${options.targetStudent.initials}, Grade ${options.targetStudent.gradeLevel}, ${options.targetStudent.schoolName}. Please verify the student information matches the CSV file.`
      });
    }

    return {
      students,
      errors,
      warnings,
      metadata: {
        totalRows: records.length,
        columnsDetected,
        formatDetected,
        goalsFiltered: isSEISFormat ? goalsFiltered : undefined,
        targetStudentFound: options.targetStudent ? students.length > 0 : undefined
      }
    };
  } catch (error: any) {
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Detect column mapping by analyzing headers
 */
function detectColumnMapping(records: string[][]): ColumnMapping {
  const mapping: ColumnMapping = {
    goalColumns: []
  };

  if (records.length === 0) {
    return mapping;
  }

  const headers = records[0];

  // Check if this is SEIS Student Goals Report format
  const isSEIS = detectSEISStudentGoalsFormat(records);

  if (isSEIS) {
    // SEIS Student Goals Report uses fixed columns:
    // Column C (index 2): Last Name
    // Column D (index 3): First Name
    // Column F (index 5): Grade
    // Column G (index 6): School of Attendance
    // Column J (index 9): IEP Date
    // Column L (index 11): Area of Need (for filtering)
    // Column M (index 12): Annual Goal # (for filtering)
    // Column O (index 14): Goal
    // Column R (index 17): Person Responsible (for filtering)
    mapping.lastName = 2;
    mapping.firstName = 3;
    mapping.grade = 5;
    mapping.schoolOfAttendance = 6;
    mapping.iepDate = 9;
    mapping.areaOfNeed = 11;
    mapping.goalType = 12;
    mapping.personResponsible = 17;
    mapping.goalColumns = [14];
    return mapping;
  }

  // Generic pattern-based detection for non-SEIS files
  const firstNamePatterns = /first\s*name|firstname|student\s*first/i;
  const lastNamePatterns = /last\s*name|lastname|student\s*last|surname/i;
  const gradePatterns = /grade|grade\s*level|current\s*grade/i;
  const goalPatterns = /goal|iep\s*goal|objective|target|present\s*level/i;

  headers.forEach((header, index) => {
    const headerText = (header || '').toLowerCase();

    // Check for first name
    if (!mapping.firstName && firstNamePatterns.test(headerText)) {
      mapping.firstName = index;
    }

    // Check for last name
    if (!mapping.lastName && lastNamePatterns.test(headerText)) {
      mapping.lastName = index;
    }

    // Check for grade
    if (!mapping.grade && gradePatterns.test(headerText)) {
      mapping.grade = index;
    }

    // Check for goal columns
    if (goalPatterns.test(headerText)) {
      if (!mapping.goalColumns.includes(index)) {
        mapping.goalColumns.push(index);
      }
    }
  });

  return mapping;
}

// The canonical grade-string normalizer lives in lib/utils/grade-parser.ts —
// SPE-240 merged the diverging CSV/XLSX copies (this one previously applied the
// SEIS 18->TK / 0->K rules the XLSX copy lacked, and both mangled spelled-out
// grades). Re-exported so existing importers and the SPE-239 fixture suite keep
// resolving it from this module.
export { normalizeGradeLevel };

/**
 * Detect if CSV is a SEIS Student Goals Report
 * Checks for specific SEIS column headers in expected positions
 *
 * Exported for the parser golden-fixture suite (SPE-239).
 */
export function detectSEISStudentGoalsFormat(records: string[][]): boolean {
  if (records.length === 0) {
    return false;
  }

  const headers = records[0];

  // SEIS Student Goals Report has these specific columns:
  // Column C (index 2): "Last Name"
  // Column D (index 3): "First Name"
  // Column F (index 5): "Grade"
  // Column G (index 6): "School of Attendance"
  // Column M (index 12): "Annual Goal #"
  // Column O (index 14): "Goal"

  const lastNameMatch = headers[2]?.toLowerCase().includes('last name');
  const firstNameMatch = headers[3]?.toLowerCase().includes('first name');
  const gradeMatch = headers[5]?.toLowerCase().includes('grade');
  const schoolMatch = headers[6]?.toLowerCase().includes('school');
  const goalTypeMatch = headers[12]?.toLowerCase().includes('annual goal');
  const goalMatch = headers[14]?.toLowerCase().includes('goal');

  // Require at least 5 out of 6 key columns to match
  const matches = [lastNameMatch, firstNameMatch, gradeMatch, schoolMatch, goalTypeMatch, goalMatch].filter(Boolean).length;

  return matches >= 5;
}

/** Normalize a header cell for template detection: trim, lowercase, collapse whitespace. */
function normalizeTemplateHeader(header: string | undefined): string {
  return (header || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Detect the Speddy roster template (SPE-225): a CSV whose header carries the
 * required Initials / Grade / Teacher columns (case-insensitive,
 * whitespace-tolerant). Sessions Per Week and Minutes Per Session are optional
 * schedule columns.
 *
 * Exported for the parser golden-fixture suite (SPE-239).
 */
export function detectSpeddyTemplateFormat(records: string[][]): boolean {
  if (records.length === 0) return false;
  const headers = (records[0] || []).map(normalizeTemplateHeader);
  const hasRosterColumns =
    headers.includes('initials') && headers.includes('grade') && headers.includes('teacher');
  if (!hasRosterColumns) return false;
  // A genuine roster has no goals. If a file also carries a goal-like column,
  // it's some other export that happens to share these headers — defer to
  // SEIS/generic detection so its goals aren't silently dropped by the
  // goal-less template parser.
  const hasGoalColumn = headers.some((h) => /goal|iep\s*goal|objective|target|present\s*level/.test(h));
  return !hasGoalColumn;
}

/**
 * If a CSV carries the roster template's signature `Initials` column but did not
 * pass `detectSpeddyTemplateFormat`, it's a roster attempt with a missing or
 * misnamed required column (e.g. `Teacher` typed as `Teacher Name`). Return a
 * roster-specific message naming what's required so the user isn't shown the
 * SEIS/generic name-column guidance (SPE-250). Returns null for genuine
 * SEIS/generic files (no `Initials` column) and for roster+goal hybrids that
 * already carry all three required columns.
 */
function describeIncompleteRosterTemplate(records: string[][]): string | null {
  const headers = (records[0] || []).map(normalizeTemplateHeader);
  // `Initials` is the roster template's signature — SEIS/generic student files
  // use First/Last Name, never Initials — so its presence marks a roster attempt.
  if (!headers.includes('initials')) return null;
  const missing = ([
    ['initials', 'Initials'],
    ['grade', 'Grade'],
    ['teacher', 'Teacher'],
  ] as const)
    .filter(([key]) => !headers.includes(key))
    .map(([, label]) => label);
  if (missing.length === 0) return null;
  return `This looks like the roster template, but it's missing a required column: ${missing.join(', ')}. Roster imports need Initials, Grade, and Teacher.`;
}

/**
 * Parse the Speddy roster template into goal-less students that carry the
 * teacher name and schedule inline. Rows missing a required field are skipped
 * (a partial row is warned), and duplicate Initials+Grade rows keep the first.
 */
function parseSpeddyTemplateRows(records: string[][]): ParseResult {
  const students: ParsedStudent[] = [];
  const warnings: Array<{ row: number; message: string }> = [];

  const headers = (records[0] || []).map(normalizeTemplateHeader);
  const col = (name: string) => headers.indexOf(name);
  const initialsCol = col('initials');
  const gradeCol = col('grade');
  const teacherCol = col('teacher');
  const sessionsCol = col('sessions per week');
  const minutesCol = col('minutes per session');

  const seen = new Set<string>();

  for (let rowIndex = 1; rowIndex < records.length; rowIndex++) {
    const row = records[rowIndex];
    const rowNum = rowIndex + 1;

    const initials = (row[initialsCol] || '').toUpperCase().trim();
    const gradeRaw = (row[gradeCol] || '').trim();
    const teacher = (row[teacherCol] || '').trim();

    if (!initials || !gradeRaw || !teacher) {
      // A wholly-empty row is a trailing blank — ignore it silently. A partial
      // row (some fields present) is a likely mistake — surface it.
      if (initials || gradeRaw || teacher) {
        warnings.push({ row: rowNum, message: 'Row skipped — roster rows need Initials, Grade, and Teacher.' });
      }
      continue;
    }

    // Mirror the confirm route's 2–4-letter initials rule so a bad value is
    // flagged at parse time instead of failing only at confirm.
    if (normalizeInitialsForKey(initials).length < 2 || normalizeInitialsForKey(initials).length > 4) {
      warnings.push({ row: rowNum, message: `Row skipped — initials "${initials}" must be 2–4 letters.` });
      continue;
    }

    const gradeLevel = normalizeGradeLevel(gradeRaw);
    // Same key the route/confirm dedup on, so "J.D." and "JD" collapse together.
    const dedupKey = buildStudentDedupKey(initials, gradeLevel);
    if (seen.has(dedupKey)) {
      warnings.push({ row: rowNum, message: `Duplicate roster row for ${initials} (grade ${gradeLevel}) — keeping the first.` });
      continue;
    }
    seen.add(dedupKey);

    const sessions = sessionsCol >= 0 ? parseInt((row[sessionsCol] || '').trim(), 10) : NaN;
    const minutes = minutesCol >= 0 ? parseInt((row[minutesCol] || '').trim(), 10) : NaN;

    students.push({
      firstName: '',
      lastName: '',
      initials,
      gradeLevel,
      goals: [],
      teacherName: teacher,
      sessionsPerWeek: Number.isFinite(sessions) && sessions > 0 ? sessions : undefined,
      minutesPerSession: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
      rawRow: rowNum,
    });
  }

  return {
    students,
    errors: [],
    warnings,
    metadata: {
      totalRows: records.length,
      columnsDetected: records[0] || [],
      formatDetected: 'speddy-template',
      goalsFiltered: undefined,
    },
  };
}

/**
 * Check if a goal matches the provider's service type
 * Uses keyword-based matching for SEIS Student Goals Report:
 * - Checks Area of Need (Column L), Annual Goal # (Column M), and Person Responsible (Column R)
 * - Falls back to numeric service codes for Delivery reports
 *
 * @param areaOfNeed - Column L: Area of Need (e.g., "Speech/Language", "Academic")
 * @param goalType - Column M: Annual Goal # (e.g., "Speech (1 of 1)", "Academic (2 of 3)")
 * @param personResponsible - Column R: Person Responsible (e.g., "SLP, Teacher", "Resource Specialist")
 * @param providerRole - The provider's role (resource, speech, ot, counseling)
 * @returns true if the goal should be included for this provider
 */
function isGoalForProvider(
  areaOfNeed: string,
  goalType: string,
  personResponsible: string,
  providerRole?: string
): boolean {
  // If no provider role specified, include all goals
  if (!providerRole) {
    return true;
  }

  // Get the service type code for the provider's role
  const serviceTypeCode = getServiceTypeCode(providerRole);

  // If no specific code for this role (e.g., psychologist), include all goals
  if (!serviceTypeCode) {
    return true;
  }

  // First, check if goalType contains numeric service code (for Delivery reports)
  if (goalType && goalType.includes(serviceTypeCode)) {
    return true;
  }

  // Fall back to keyword-based matching for Student Goals Report
  return isGoalForProviderByKeywords(areaOfNeed, goalType, personResponsible, providerRole);
}

/**
 * Parse a date string into ISO format (YYYY-MM-DD)
 * Handles various date formats from CSV/SEIS exports including Excel serial dates
 */
function parseDate(dateStr: string): string | undefined {
  if (!dateStr || !dateStr.trim()) {
    return undefined;
  }

  const trimmed = dateStr.trim();

  // Try parsing as ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Try parsing MM/DD/YYYY format
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try parsing MM-DD-YYYY format
  const usDashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (usDashMatch) {
    const [, month, day, year] = usDashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Check if it's a numeric-only string (Excel serial date)
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial > 0) {
      return excelSerialToDate(serial);
    }
  }

  // Try parsing full ISO datetime format (YYYY-MM-DDTHH:MM:SS)
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    try {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return undefined;
}

/**
 * Convert Excel serial date to ISO date string
 * Excel's epoch is 1899-12-30 (day 0 = Dec 30, 1899)
 *
 * Exported for the parser golden-fixture suite (SPE-239).
 */
export function excelSerialToDate(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 1) {
    return undefined;
  }

  // Excel's epoch: January 1, 1900 is day 1
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899
  const days = Math.floor(serial);

  // Add the days to the epoch
  const resultDate = new Date(excelEpoch);
  resultDate.setUTCDate(resultDate.getUTCDate() + days);

  // Validate the result is a reasonable date (between 1900 and 2100)
  const year = resultDate.getUTCFullYear();
  if (year < 1900 || year > 2100) {
    return undefined;
  }

  return resultDate.toISOString().split('T')[0];
}

