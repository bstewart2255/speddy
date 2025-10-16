/**
 * CSV IEP Goals Parser
 * Parses CSV files to extract student IEP goals
 */

import { parse } from 'csv-parse/sync';

export interface ParsedStudent {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  school?: string; // School of Attendance (SEIS Column G)
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
  };
}

interface ColumnMapping {
  firstName?: number;
  lastName?: number;
  grade?: number;
  school?: number; // School of Attendance (SEIS Column G)
  goalType?: number; // Annual Goal # (SEIS Column M) - used for filtering
  goalColumns: number[];
}

export interface ParseOptions {
  userSchools?: string[]; // School names user is associated with (for verification)
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
        const school = columnMapping.school !== undefined ? row[columnMapping.school] || '' : '';

        // Skip rows without student data
        if (!firstName.trim() || !lastName.trim() || !grade.trim()) {
          continue;
        }

        // For SEIS format, check school verification if user has multiple schools
        if (isSEISFormat && school && options.userSchools && options.userSchools.length > 0) {
          const schoolMatches = options.userSchools.some(userSchool =>
            normalizeSchoolName(school).includes(normalizeSchoolName(userSchool)) ||
            normalizeSchoolName(userSchool).includes(normalizeSchoolName(school))
          );

          if (!schoolMatches) {
            warnings.push({
              row: rowIndex + 1,
              message: `Student "${firstName} ${lastName}" attends "${school}" which doesn't match your school(s). Skipping.`
            });
            continue;
          }
        }

        // Extract goals from goal columns
        const goals: string[] = [];

        for (const goalColIndex of columnMapping.goalColumns) {
          const goalText = row[goalColIndex] || '';

          // For SEIS format, filter by goal type (Column M)
          if (isSEISFormat && columnMapping.goalType !== undefined) {
            const goalType = row[columnMapping.goalType] || '';

            if (!isProviderGoal(goalType)) {
              goalsFiltered++;
              continue; // Skip non-provider goals (Speech, OT, Counseling, etc.)
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

        // Generate initials
        const initials = `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;

        // Normalize grade level
        const normalizedGrade = normalizeGradeLevel(grade);

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
            school: school ? school.trim() : undefined,
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

    return {
      students,
      errors,
      warnings,
      metadata: {
        totalRows: records.length,
        columnsDetected,
        formatDetected,
        goalsFiltered: isSEISFormat ? goalsFiltered : undefined
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
    // Column M (index 12): Annual Goal # (for filtering)
    // Column O (index 14): Goal
    mapping.lastName = 2;
    mapping.firstName = 3;
    mapping.grade = 5;
    mapping.school = 6;
    mapping.goalType = 12;
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
 * Check if a goal type indicates a provider/resource goal
 * (vs. Speech, OT, Counseling, etc.)
 */
function isProviderGoal(goalType: string): boolean {
  if (!goalType) {
    return true; // If no goal type specified, include it
  }

  const goalTypeLower = goalType.toLowerCase();

  // Resource/Academic goal keywords
  const providerKeywords = [
    'resource',
    'academic',
    'sai', // Special Academic Instruction
    'classroom',
    'reading',
    'writing',
    'math',
    'ela'
  ];

  // Non-provider goal keywords (to exclude)
  const excludeKeywords = [
    'speech',
    'slp',
    'language pathologist',
    'ot', // Occupational Therapy
    'occupational',
    'pt', // Physical Therapy
    'physical',
    'counseling',
    'counsel',
    'behavior',
    'social work',
    'apt', // Adapted Physical Education
    'adaptive pe'
  ];

  // Check if it matches exclude keywords first (higher priority)
  for (const keyword of excludeKeywords) {
    if (goalTypeLower.includes(keyword)) {
      return false;
    }
  }

  // Check if it matches provider keywords
  for (const keyword of providerKeywords) {
    if (goalTypeLower.includes(keyword)) {
      return true;
    }
  }

  // If no specific keywords found, default to including it
  // (Better to over-include than miss goals)
  return true;
}

/**
 * Normalize school name for comparison
 */
function normalizeSchoolName(schoolName: string): string {
  return schoolName
    .toLowerCase()
    .replace(/elementary|middle|high|school|unified|district/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
