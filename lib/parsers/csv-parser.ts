/**
 * CSV IEP Goals Parser
 * Parses CSV files to extract student IEP goals
 */

import { parse } from 'csv-parse/sync';
import { normalizeSchoolName } from '../school-helpers';
import { getServiceTypeCode, getServiceTypeNameForRole, isGoalForProviderByKeywords } from './service-type-mapping';

export interface ParsedStudent {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  schoolOfAttendance?: string; // School of Attendance (SEIS Column G)
  goals: string[];
  rawRow: number; // For debugging
}

export interface ParseResult {
  students: ParsedStudent[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  metadata: {
    totalRows: number;
    columnsDetected: string[];
    formatDetected?: 'seis-student-goals' | 'generic';
    goalsFiltered?: number; // Number of goals filtered out (SEIS only)
    targetStudentFound?: boolean; // Whether target student was found (when targetStudent filter is used)
  };
}

interface ColumnMapping {
  firstName?: number;
  lastName?: number;
  grade?: number;
  schoolOfAttendance?: number; // School of Attendance (SEIS Column G)
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

    try {
      // Try UTF-8 first
      records = parse(buffer, {
        encoding: 'utf-8',
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (e) {
      // Fallback to latin1
      records = parse(buffer, {
        encoding: 'latin1',
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      });
    }

    if (records.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Detect column mapping from headers
    const columnMapping = detectColumnMapping(records);
    const columnsDetected = records[0] || [];

    // Detect if this is a SEIS Student Goals Report
    const isSEISFormat = detectSEISStudentGoalsFormat(records);
    const formatDetected = isSEISFormat ? 'seis-student-goals' : 'generic' as const;

    if (!columnMapping.firstName || !columnMapping.lastName || !columnMapping.grade) {
      errors.push({
        row: 0,
        message: isSEISFormat
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

        // Skip rows without student data
        if (!firstName.trim() || !lastName.trim() || !grade.trim()) {
          continue;
        }

        // Generate initials early for target matching
        const initials = `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
        const normalizedGrade = normalizeGradeLevel(grade);

        // If target student specified, filter to only that student
        if (options.targetStudent) {
          const { targetStudent } = options;

          // Check initials match
          if (initials !== targetStudent.initials) {
            continue;
          }

          // Check grade match
          if (normalizedGrade !== targetStudent.gradeLevel) {
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
        } else {
          // Add new student
          studentMap.set(studentKey, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            initials,
            gradeLevel: normalizedGrade,
            schoolOfAttendance: schoolOfAttendance ? schoolOfAttendance.trim() : undefined,
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
    // Column L (index 11): Area of Need (for filtering)
    // Column M (index 12): Annual Goal # (for filtering)
    // Column O (index 14): Goal
    // Column R (index 17): Person Responsible (for filtering)
    mapping.lastName = 2;
    mapping.firstName = 3;
    mapping.grade = 5;
    mapping.schoolOfAttendance = 6;
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

/**
 * Normalize grade level to standard format (K, TK, 1-12)
 */
function normalizeGradeLevel(grade: string): string {
  const gradeStr = grade.trim().toUpperCase();

  // Remove common prefixes/suffixes
  let normalized = gradeStr
    .replace(/GRADE/i, '')
    .replace(/TH|ST|ND|RD/i, '')
    .trim();

  // Handle special cases
  if (/^T\.?K\.?$|TRANSITIONAL\s*K|TK/i.test(normalized)) {
    return 'TK';
  }

  if (/^K\.?$|KINDER|KINDERGARTEN/i.test(normalized)) {
    return 'K';
  }

  // Handle spelled-out numbers
  const numberWords: { [key: string]: string } = {
    'FIRST': '1', 'SECOND': '2', 'THIRD': '3', 'FOURTH': '4',
    'FIFTH': '5', 'SIXTH': '6', 'SEVENTH': '7', 'EIGHTH': '8',
    'NINTH': '9', 'TENTH': '10', 'ELEVENTH': '11', 'TWELFTH': '12'
  };

  for (const [word, num] of Object.entries(numberWords)) {
    if (normalized.includes(word)) {
      return num;
    }
  }

  // Extract numeric grade (handle leading zeros like "02" -> "2")
  const match = normalized.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10); // parseInt removes leading zeros

    // SEIS-specific: Grade "18" often represents TK or Pre-K
    if (num === 18) {
      return 'TK';
    }

    // Standard grades 1-12
    if (num >= 1 && num <= 12) {
      return String(num);
    }

    // Grade 0 might be Kindergarten
    if (num === 0) {
      return 'K';
    }
  }

  // Return as-is if we couldn't normalize
  return grade.trim();
}

/**
 * Detect if CSV is a SEIS Student Goals Report
 * Checks for specific SEIS column headers in expected positions
 */
function detectSEISStudentGoalsFormat(records: string[][]): boolean {
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

