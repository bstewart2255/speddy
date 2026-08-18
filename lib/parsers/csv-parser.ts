/**
 * CSV IEP Goals Parser
 * Parses CSV files to extract student IEP goals
 */

import { parse } from 'csv-parse/sync';
import { TextDecoder } from 'util';
import { normalizeSchoolName } from '../school-helpers';
import { getServiceTypeCode, getServiceTypeNameForRole, isGoalForProviderByKeywords, hasNoProviderRoutingSignal, blankMetadataGoalWarning } from './service-type-mapping';
import { normalizeGradeLevel } from '../utils/grade-parser';
import { buildStudentDedupKey, normalizeInitialsForKey } from '../utils/student-dedup-key';

export interface ParsedStudent {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  schoolOfAttendance?: string; // SEIS "School of Attendance"
  iepDate?: string; // SEIS "IEP Date" - for validation warnings
  // The district's own student id (SPE-339). SEIS "District ID"; the roster
  // template's optional "Student ID" column. Undefined when the file omits it.
  districtStudentId?: string;
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

/**
 * Column INDEXES for one file. For SEIS files these are resolved from the
 * header names (SPE-558), so they differ between the per-provider and
 * district-wide exports of the same report.
 */
interface ColumnMapping {
  firstName?: number;
  lastName?: number;
  grade?: number;
  districtStudentId?: number; // SEIS "District ID" - SPE-339
  schoolOfAttendance?: number; // SEIS "School of Attendance"
  iepDate?: number; // SEIS "IEP Date" - for validation warnings
  areaOfNeed?: number; // SEIS "Area Of Need" - used for filtering
  goalType?: number; // SEIS "Annual Goal #" - used for filtering
  personResponsible?: number; // SEIS "Person Responsible" - used for filtering
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

    if (
      columnMapping.firstName === undefined ||
      columnMapping.lastName === undefined ||
      columnMapping.grade === undefined
    ) {
      // `firstName`/`lastName`/`grade` are column *indices*; a required column
      // in the leftmost position has index 0, so the falsy `!columnMapping.x`
      // form treated a detected index-0 column as missing and wrongly rejected
      // the file. Compare against undefined explicitly (SPE-252).
      // A file carrying the roster template's signature `Initials` column and NO
      // name columns is a roster attempt with a missing/misnamed required column
      // — give the roster requirement rather than the SEIS/generic name-column
      // guidance (SPE-250). Guard on the name columns being absent so a genuine
      // name-based file that also carries an Initials column (e.g. one missing
      // only its Grade column) still gets the name guidance rather than a
      // misleading "looks like the roster template".
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
      // Only reachable on the generic path: SEIS detection now requires the goal
      // column through the same lookup the mapper uses, so an isSEISFormat file
      // always has one.
      errors.push({
        row: 0,
        message:
          'Could not detect IEP goal columns. Looking for columns containing: Goal, IEP, Objective, Target.'
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

    // Columns we can parse without, but whose absence costs the user something
    // they'd never see otherwise (SPE-558). The whole complaint about this file
    // shape was that it failed SILENTLY, so an unresolved column says so rather
    // than quietly producing students with the field missing.
    if (isSEISFormat && columnMapping.districtStudentId === undefined) {
      warnings.push({
        row: 0,
        message:
          'No "District ID" column found, so these students will import without their district student ID. ' +
          'Their classroom teachers cannot be matched from your student information system without it — ' +
          're-export this report with the District ID column included.',
      });
    }

    if (isSEISFormat && columnMapping.schoolOfAttendance === undefined) {
      // Two guards downstream read this column and both fail OPEN without it:
      // the `userSchools` check below skips entirely (importing students from
      // schools this provider doesn't serve), and the dedup key loses its
      // school part, so two same-name same-grade children at different schools
      // merge into one record carrying both their goals (the SPE-264 case).
      warnings.push({
        row: 0,
        message:
          'No "School of Attendance" column found. These students cannot be limited to your school, ' +
          'and two students with the same name and grade at different schools would be merged into one. ' +
          'Check the students below carefully, or re-export this report with the School of Attendance column.',
      });
    }

    const routingColumnsAbsent =
      columnMapping.areaOfNeed === undefined &&
      columnMapping.goalType === undefined &&
      columnMapping.personResponsible === undefined;

    if (
      isSEISFormat &&
      routingColumnsAbsent &&
      options.providerRole &&
      getServiceTypeCode(options.providerRole) !== null
    ) {
      // Every goal is filtered by these three columns; with none of them present
      // the file imports as zero students, which without this reads as "the
      // import did nothing".
      warnings.push({
        row: 0,
        message:
          'None of the "Area Of Need", "Annual Goal #" or "Person Responsible" columns were found. ' +
          'Those are what route each goal to the right provider, so no goals can be matched to your ' +
          'caseload — re-export this report with those columns included.',
      });
    }

    if (isSEISFormat && columnMapping.iepDate === undefined) {
      warnings.push({
        row: 0,
        message:
          'No "IEP Date" column found, so these students will import without their IEP meeting date. ' +
          'Speddy uses it to flag annual reviews coming due — re-export this report with the IEP Date ' +
          'column included.',
      });
    }

    // How many rows the school filter dropped, and how many of those were named
    // individually — see the bounded warning inside the row loop.
    const OTHER_SCHOOL_WARNING_LIMIT = 5;
    let otherSchoolSkipped = 0;

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
        const districtStudentId = columnMapping.districtStudentId !== undefined
          ? (row[columnMapping.districtStudentId] || '').trim()
          : '';

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
            // Bounded: a district-wide export is mostly other schools' students,
            // so one warning per row is thousands of them — and when nothing
            // survives the filter, the zero-student path returns warnings
            // uncapped. Name the first few, then count the rest (summarized
            // after the loop).
            if (otherSchoolSkipped < OTHER_SCHOOL_WARNING_LIMIT) {
              warnings.push({
                row: rowIndex + 1,
                message: `Student "${firstName} ${lastName}" attends "${schoolOfAttendance}" which doesn't match your school(s). Skipping.`
              });
            }
            otherSchoolSkipped++;
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
        // When the routing COLUMNS are absent outright, every row trivially has
        // no routing signal, and the file-level warning above already says so
        // once. Repeating it per row would bury that message under thousands of
        // duplicates — and the zero-student error path returns warnings uncapped.
        if (
          isSEISFormat &&
          !routingColumnsAbsent &&
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
              message: blankMetadataGoalWarning(initials, normalizedGrade),
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

        // Create unique key for consolidating a student's goal rows: name +
        // grade + school. School is part of the key because two DIFFERENT
        // students who share first name, last name, and grade but attend
        // different schools must NOT merge — merging would drop one student or
        // graft the other's IEP goals onto the wrong student once the
        // selected-school filter runs downstream. A single student's goal rows
        // all carry the same School of Attendance, so intended merges are
        // unaffected. (SPE-264)
        const schoolKeyPart = schoolOfAttendance ? normalizeSchoolName(schoolOfAttendance.trim()) : '';
        const studentKey = `${firstName.trim().toLowerCase()}_${lastName.trim().toLowerCase()}_${normalizedGrade}_${schoolKeyPart}`;

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
          // Same rule for the district id (SPE-339): a student's goal rows all
          // carry the same id, but only some rows may have it filled in.
          if (!existing.districtStudentId && districtStudentId) {
            existing.districtStudentId = districtStudentId;
          } else if (
            districtStudentId &&
            existing.districtStudentId &&
            existing.districtStudentId !== districtStudentId
          ) {
            // Two different ids under one name+grade+school key means either the
            // export is inconsistent or two real children are being merged by
            // that key. Keep the first and say so rather than dropping it
            // silently.
            warnings.push({
              row: rowIndex + 1,
              message: `Student ID mismatch for ${firstName} ${lastName}: found "${districtStudentId}" but already recorded "${existing.districtStudentId}". Keeping the first — check this student in your export.`,
            });
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
            districtStudentId: districtStudentId || undefined,
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

    if (otherSchoolSkipped > OTHER_SCHOOL_WARNING_LIMIT) {
      warnings.push({
        row: 0,
        message:
          `${otherSchoolSkipped} students in this file attend schools other than yours and were ` +
          `skipped (${OTHER_SCHOOL_WARNING_LIMIT} of them listed above). That is expected for a ` +
          'district-wide export.',
      });
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
    // Located by header name, not position — see mapSeisColumnsByHeader
    // (SPE-558). The per-provider and district-wide exports of this report
    // carry the same labels at different indexes.
    return mapSeisColumnsByHeader(headers);
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

    // Check for grade. Intentionally the falsy `!mapping.grade` (not
    // `=== undefined`): gradePatterns matches any "grade" substring, so an early
    // false positive like "Gradebook ID" at index 0 must stay overridable by a
    // later real "Grade" column. The index-0 fix (SPE-252) lives at the
    // required-column gate in parseCSVReport, which needs `=== undefined`; this
    // first-detection guard deliberately keeps its override behavior.
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
 * How each SEIS field is located in a header row: the exact normalized names
 * first, then an ANCHORED pattern for the label variants.
 *
 * SPE-558: these used to be checked at FIXED INDEXES (2/3/5/6/12/14), which is
 * only true of the per-provider export. SEIS's district-wide export of the same
 * report inserts an `SSID` column at index 1, shifting every field after it by
 * one — that scored 0 of 6, fell through to the generic path, and imported with
 * no district ID, no school, no IEP date and progress labels mixed into the
 * goals, all without raising a single error. Matching on the header NAME
 * absorbs both shapes and any future column reorder.
 *
 * Anchored is the whole point. This report has ten headers containing the word
 * "goal" ("Annual Goal #", "Purpose(s) of Goal", "Goal Met", "Comparison To
 * Goal", "Goal Progress"...) and a "Grade Level Standard" that a bare /grade/
 * scan binds to in preference to nothing. An unanchored sweep is what put
 * "Limited Progress" into a child's IEP goals in the first place, so every
 * pattern here matches a WHOLE header or not at all.
 *
 * Each pattern does allow a trailing parenthetical, because SEIS decorates
 * labels that way — "Date of IEP (Meeting Date on Current IEP Forms)", and in
 * the wild "Grade (as of 10/01)" or "Last Name (Legal)". The positional code
 * this replaces tolerated any such suffix for free by never reading the label;
 * without this, a decorated header on a REQUIRED column would turn a file that
 * used to import into a hard failure. "Grade Level Standard" stays excluded:
 * a bare word suffix is not a parenthetical.
 *
 * One table, used by both the detector and the mapper below. Detection tolerates
 * one missing signature column, so the mapper can still return undefined for a
 * field — every such field either has a file-level warning below or, for
 * `grade`, a named error. The one exception is `goal`, which detection requires
 * outright, since a file claimed without it can only dead-end.
 */
const SEIS_FIELDS = {
  lastName: {
    exact: ['last name'],
    pattern: /^(student\s*)?last\s*name(\s*\(.*\))?$|^lastname$|^surname$/,
  },
  firstName: {
    exact: ['first name'],
    pattern: /^(student\s*)?first\s*name(\s*\(.*\))?$|^firstname$/,
  },
  // Order within `exact` carries no meaning — findSeisColumn takes the leftmost
  // column matching any of them.
  grade: {
    exact: ['grade', 'grade level'],
    pattern: /^(current\s*|student\s*)?grade(\s*level)?(\s*\(.*\))?$/,
  },
  schoolOfAttendance: {
    exact: ['school of attendance'],
    pattern: /^(current\s*|attending\s*)?school(\s*(of\s*attendance|name))?(\s*\(.*\))?$/,
  },
  goalType: {
    exact: ['annual goal #', 'annual goal'],
    pattern: /^annual\s*goal(\s*#)?(\s*\(.*\))?$|^goal\s*type$|^service\s*(type|area)$/,
  },
  goal: { exact: ['goal'], pattern: /^(iep\s*)?goal(\s*(text|statement))?(\s*\(.*\))?$/ },
  // Anchored so it cannot match "District of Service" (SPE-339).
  districtStudentId: {
    exact: ['district id', 'district student id'],
    pattern: /^district\s*(student\s*)?id(\s*\(.*\))?$/,
  },
  // "Date of IEP (Meeting Date on Current IEP Forms)" is how SEIS labels this on
  // some exports, so match that prefix too. Deliberately NOT `annual review`,
  // which seis-parser.ts accepts: in THIS report that is a progress-reporting
  // column, so borrowing it for parity would bind the IEP date to the wrong one.
  iepDate: {
    exact: ['iep date'],
    pattern: /^iep\s*date(\s*\(.*\))?$|^meeting\s*date$|^date\s*of\s*iep\b/,
  },
  areaOfNeed: {
    exact: ['area of need'],
    pattern: /^area\s*(of\s*)?need(\s*\(.*\))?$|^need\s*area$/,
  },
  personResponsible: {
    exact: ['person responsible'],
    pattern: /^person\s*responsible(\s*\(.*\))?$|^responsible\s*(person|party)$/,
  },
} as const;

/**
 * Where each field sits in the per-provider export — the exact fixed indexes
 * this parser used before SPE-558.
 *
 * Labels are an unbounded space: "Grade Level Code", "Last Name of Student",
 * "School of Attendance Name" are all real-looking and none matches an anchored
 * pattern, while loosening the patterns to catch them re-admits "Grade Level
 * Standard". Position is the knowledge the old code had and label matching
 * threw away, so it comes back as the fallback: once enough columns HAVE been
 * identified by label, they fix the offset between this file and the canonical
 * layout, and any column that couldn't be identified is read from where the
 * layout says it should be. The district-wide export is a uniform +1 shift of
 * this table; the per-provider export is offset 0.
 */
const SEIS_CANONICAL_INDEX = {
  districtStudentId: 1,
  lastName: 2,
  firstName: 3,
  grade: 5,
  schoolOfAttendance: 6,
  iepDate: 9,
  areaOfNeed: 11,
  goalType: 12,
  goal: 14,
  personResponsible: 17,
} as const satisfies Record<keyof typeof SEIS_FIELDS, number>;

/** The six fields whose presence identifies the report (5 of 6 required). */
const SEIS_SIGNATURE_FIELDS = [
  'lastName',
  'firstName',
  'grade',
  'schoolOfAttendance',
  'goalType',
  'goal',
] as const;

/**
 * Columns that ONLY this SEIS report carries. The signature above is made of
 * common labels, so on its own it also describes an ordinary
 * Last/First/Grade/School/Goal spreadsheet — which would then be handed the
 * SEIS path's per-role goal filtering and import as zero students, surfacing to
 * the user as a 400 naming a SEIS report they never uploaded. Requiring two of
 * these keeps such a file on the generic path.
 *
 * Kept deliberately narrow to SEIS's own vocabulary. Ordinary special-ed
 * spreadsheets legitimately carry "Case Manager", "IEP Date", "District ID",
 * "Area Of Need" and "Baseline", so none of those can be a marker — two of them
 * together are an unremarkable hand-built goals sheet, not evidence of a SEIS
 * export.
 */
const SEIS_MARKER_HEADERS = [
  'seis id',
  'district of service',
  'eligibility status',
  'purpose(s) of goal',
  'goal met',
] as const;

/**
 * The report's OTHER columns — everything it ships that isn't one of the mapped
 * fields above.
 *
 * This is what makes the positional fallback safe. A column that was RELABELLED
 * leaves an unfamiliar header at its position, which is exactly what the
 * fallback is for. A column that was REMOVED slides a different column of this
 * same report into that position — and filling there imports the wrong data
 * silently: "SSID" read as the district student id (poisoning the key the SIS
 * link sync matches on), or "Objective 1" read as Person Responsible (routing a
 * goal to the wrong provider's caseload). Recognizing the report's own columns
 * tells those two cases apart.
 */
const SEIS_OTHER_COLUMNS: readonly (string | RegExp)[] = [
  'ssid',
  'birthdate',
  'case manager',
  'case manager email',
  'baseline',
  'standard',
  'grade level standard',
  'annual review',
  'added on',
  'added by',
  'updated by',
  'updated on',
  'last affirmed pr',
  'created by',
  'created date',
  'last modified by',
  'last modified date',
  'reporting progress',
  'comparison to goal',
  'progress percentage',
  'curriculum',
  'frequency',
  'assessment method',
  'owner',
  'owner email',
  'record locked',
  'record status',
  'source system',
  'export batch',
  'export timestamp',
  /^objective\s*\d/,
  /^progress\s*report/,
  /^summary$/,
  /^comments$/,
  /^goal\s*progress$/,
];

/**
 * Resolve one SEIS field to a column index: the LEFTMOST column carrying any of
 * the field's exact names, else the leftmost matching its pattern.
 *
 * Leftmost-across-all-names rather than name-by-name across the row, because
 * name priority has a failure mode in both directions: with 'grade' tried
 * first, a file whose grade sits under "Grade Level" binds to a stray "Grade"
 * column; with 'grade level' first, a stray "Grade Level" beats the real
 * "Grade". Position is the tie-breaker that is actually true of this report —
 * identity and demographic columns come before the trailing metadata ones.
 */
function findSeisColumn(normalized: string[], field: keyof typeof SEIS_FIELDS): number | undefined {
  const { exact, pattern } = SEIS_FIELDS[field];
  const names = new Set<string>(exact);
  const exactIndex = normalized.findIndex((header) => names.has(header));
  if (exactIndex !== -1) return exactIndex;
  const index = normalized.findIndex((header) => pattern.test(header));
  return index === -1 ? undefined : index;
}

/** Every SEIS field's column index, by label where possible. */
type SeisColumns = Partial<Record<keyof typeof SEIS_FIELDS, number>>;

const SEIS_FIELD_NAMES = Object.keys(SEIS_CANONICAL_INDEX) as Array<keyof typeof SEIS_FIELDS>;

/**
 * Resolve every SEIS field: by label first, then — for whatever the labels
 * couldn't name — by canonical position, shifted by the offset the identified
 * columns agree on.
 *
 * The offset needs THREE agreeing witnesses and no dissent. Both real shapes
 * satisfy that easily (offset 0 and +1, every field agreeing), while a file
 * that merely resembles this report produces disagreement and gets no
 * positional filling at all. A filled column is never allowed to land on one
 * another field already holds, so a wrong guess can't quietly steal a column
 * that was positively identified.
 */
function resolveSeisColumns(normalized: string[]): SeisColumns {
  const columns: SeisColumns = {};
  for (const field of SEIS_FIELD_NAMES) {
    const index = findSeisColumn(normalized, field);
    if (index !== undefined) columns[field] = index;
  }

  const identified = SEIS_FIELD_NAMES.filter((field) => columns[field] !== undefined);
  const offsets = new Set(identified.map((field) => columns[field]! - SEIS_CANONICAL_INDEX[field]));
  if (identified.length < 3 || offsets.size !== 1) return columns;

  const offset = [...offsets][0];
  const taken = new Set(identified.map((field) => columns[field]!));

  // Fill only onto a header this report doesn't otherwise account for. A
  // relabelled column leaves an unfamiliar header behind; a REMOVED one slides
  // another of the report's own columns into its place, and filling there
  // imports the wrong data with no error at all.
  const namesSomethingElse = (index: number, field: keyof typeof SEIS_FIELDS): boolean => {
    const header = normalized[index];
    if (!header) return false;
    if ((SEIS_MARKER_HEADERS as readonly string[]).includes(header)) return true;
    if (
      SEIS_OTHER_COLUMNS.some((known) =>
        typeof known === 'string' ? known === header : known.test(header),
      )
    ) {
      return true;
    }
    return SEIS_FIELD_NAMES.some((other) => {
      if (other === field) return false;
      const { exact, pattern } = SEIS_FIELDS[other];
      return (exact as readonly string[]).includes(header) || pattern.test(header);
    });
  };

  for (const field of SEIS_FIELD_NAMES) {
    if (columns[field] !== undefined) continue;
    const candidate = SEIS_CANONICAL_INDEX[field] + offset;
    if (candidate < 0 || candidate >= normalized.length || taken.has(candidate)) continue;
    if (namesSomethingElse(candidate, field)) continue;
    columns[field] = candidate;
    taken.add(candidate);
  }
  return columns;
}

/**
 * Detect if CSV is a SEIS Student Goals Report (SPE-558): 5 of the 6 signature
 * fields resolvable, plus at least two SEIS-only marker columns.
 *
 * Exported for the parser golden-fixture suite (SPE-239).
 */
export function detectSEISStudentGoalsFormat(records: string[][]): boolean {
  if (records.length === 0) {
    return false;
  }

  const normalized = (records[0] || []).map(normalizeHeaderName);
  const columns = resolveSeisColumns(normalized);

  // The goal column is mandatory rather than one of the five-of-six, because
  // the mapper cannot proceed without it: claiming a file whose goal column
  // can't be located at all would dead-end in the no-Goal-column error, while
  // the generic path imports it (fuzzily, but it imports). Refusing the file
  // here hands it to that path instead of failing it outright.
  if (columns.goal === undefined) return false;

  const signature = SEIS_SIGNATURE_FIELDS.filter((field) => columns[field] !== undefined).length;
  if (signature < SEIS_SIGNATURE_FIELDS.length - 1) return false;

  // The markers are required unconditionally, with no full-house waiver.
  // Header labels alone cannot separate a column-trimmed SEIS export from an
  // ordinary goals spreadsheet — the two can be character-for-character
  // identical — so any waiver just moves which one gets misread. Two earlier
  // attempts at one ("Annual Goal #", then "Goal Type") each let a plain sheet
  // through to per-role filtering, which imports zero students and reports a
  // SEIS report the user never uploaded. A marker-less file goes to the generic
  // path, which is where the fixed-index detector sent it too, so this is the
  // status quo rather than a new restriction.
  const headers = new Set(normalized);
  const markers = SEIS_MARKER_HEADERS.filter((name) => headers.has(name)).length;

  return markers >= 2;
}

/**
 * Map the SEIS Student Goals Report's columns, using the same SEIS_FIELDS
 * table the detector resolved them with (SPE-558) — so anything detection
 * counted, mapping finds.
 *
 * The goal column is the anchored `Goal` / `IEP Goal` match, or the canonical
 * position — never a fuzzy label sweep. Every sweep wide enough to catch an
 * unusual goal label also catches "Purpose(s) of Goal", "Goal Met" and
 * "Comparison To Goal", which is exactly how progress labels ended up in
 * children's IEP goals.
 */
function mapSeisColumnsByHeader(headers: string[]): ColumnMapping {
  const columns = resolveSeisColumns(headers.map(normalizeHeaderName));

  return {
    districtStudentId: columns.districtStudentId,
    lastName: columns.lastName,
    firstName: columns.firstName,
    grade: columns.grade,
    schoolOfAttendance: columns.schoolOfAttendance,
    iepDate: columns.iepDate,
    areaOfNeed: columns.areaOfNeed,
    goalType: columns.goalType,
    personResponsible: columns.personResponsible,
    goalColumns: columns.goal === undefined ? [] : [columns.goal],
  };
}

/**
 * Normalize a header cell for name-based lookup: trim, lowercase, collapse
 * whitespace. Shared by the roster-template detectors and the SEIS column
 * mapping (SPE-558) — the real SEIS export ships headers with trailing spaces
 * ("Summary "), so collapsing is load-bearing, not cosmetic.
 */
function normalizeHeaderName(header: string | undefined): string {
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
  const headers = (records[0] || []).map(normalizeHeaderName);
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
  const headers = (records[0] || []).map(normalizeHeaderName);
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

  const headers = (records[0] || []).map(normalizeHeaderName);
  const col = (name: string) => headers.indexOf(name);
  const initialsCol = col('initials');
  const gradeCol = col('grade');
  const teacherCol = col('teacher');
  const sessionsCol = col('sessions per week');
  const minutesCol = col('minutes per session');
  // SPE-339: optional, so rosters saved from the older template still parse.
  const studentIdCol = col('student id');

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
    const districtStudentId = studentIdCol >= 0 ? (row[studentIdCol] || '').trim() : '';

    students.push({
      firstName: '',
      lastName: '',
      initials,
      gradeLevel,
      goals: [],
      teacherName: teacher,
      districtStudentId: districtStudentId || undefined,
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

