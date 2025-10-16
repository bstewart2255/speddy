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
  goals: string[];
  rawRow: number; // For debugging
}

export interface ParseResult {
  students: ParsedStudent[];
  errors: Array<{ row: number; message: string }>;
  metadata: {
    totalRows: number;
    columnsDetected: string[];
  };
}

interface ColumnMapping {
  firstName?: number;
  lastName?: number;
  grade?: number;
  goalColumns: number[];
}

/**
 * Parse CSV file and extract student IEP goals
 */
export async function parseCSVReport(buffer: Buffer): Promise<ParseResult> {
  const students: ParsedStudent[] = [];
  const errors: Array<{ row: number; message: string }> = [];

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

    if (!columnMapping.firstName || !columnMapping.lastName || !columnMapping.grade) {
      errors.push({
        row: 0,
        message: 'Could not detect student name or grade columns. Looking for columns like: First Name, Last Name, Grade, Student Name.'
      });

      return {
        students,
        errors,
        metadata: {
          totalRows: records.length,
          columnsDetected
        }
      };
    }

    if (columnMapping.goalColumns.length === 0) {
      errors.push({
        row: 0,
        message: 'Could not detect IEP goal columns. Looking for columns containing: Goal, IEP, Objective, Target.'
      });

      return {
        students,
        errors,
        metadata: {
          totalRows: records.length,
          columnsDetected
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

        // Skip rows without student data
        if (!firstName.trim() || !lastName.trim() || !grade.trim()) {
          continue;
        }

        // Extract goals from all goal columns
        const goals: string[] = [];
        for (const goalColIndex of columnMapping.goalColumns) {
          const goalText = row[goalColIndex] || '';
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
      metadata: {
        totalRows: records.length,
        columnsDetected
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

  // Common header patterns
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

  // Extract numeric grade (1-12)
  const match = normalized.match(/\d+/);
  if (match) {
    const num = parseInt(match[0]);
    if (num >= 1 && num <= 12) {
      return String(num);
    }
  }

  // Return as-is if we couldn't normalize
  return grade.trim();
}
