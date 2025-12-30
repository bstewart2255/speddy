/**
 * SEIS IEP Goals Parser
 * Parses SEIS (IEP management software) Excel reports to extract student IEP goals
 */

import * as ExcelJS from 'exceljs';
import { getServiceTypeCode } from './service-type-mapping';

// ExcelJS cell value types for rich text and formula results
interface ExcelRichTextValue {
  richText: Array<{ text: string }>;
}

interface ExcelFormulaValue {
  result?: string | number | boolean | Date;
}

export interface ParsedStudent {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  goals: string[];
  schoolOfAttendance?: string; // From column G - used to filter by current school
  rawRow: number; // For debugging
}

export interface ParseResult {
  students: ParsedStudent[];
  errors: Array<{ row: number; message: string }>;
  metadata: {
    totalRows: number;
    sheetsProcessed: string[];
    goalsFiltered?: number;
  };
}

export interface ParseOptions {
  providerRole?: string; // Provider's role for service type filtering (resource, speech, ot, counseling)
}

interface ColumnMapping {
  firstName?: number;
  lastName?: number;
  grade?: number;
  schoolOfAttendance?: number; // Column G in SEIS reports
  goalType?: number; // Annual Goal # / Service type column (Column M in SEIS)
  goalColumns: number[];
}

/**
 * Parse SEIS Excel file and extract student IEP goals
 * @param buffer - The Excel file buffer
 * @param options - Options including providerRole for service type filtering
 */
export async function parseSEISReport(
  buffer: Buffer,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS expects ArrayBuffer, but Buffer is compatible
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const students: ParsedStudent[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const sheetsProcessed: string[] = [];

  // Get the service type code for the provider's role
  const providerRole = options.providerRole || 'resource';
  const serviceTypeCode = getServiceTypeCode(providerRole);
  let goalsFiltered = 0;

  // Temporary map to consolidate duplicate students across all worksheets
  const studentMap = new Map<string, ParsedStudent>();

  // Process each worksheet
  for (const worksheet of workbook.worksheets) {
    sheetsProcessed.push(worksheet.name);

    try {
      const columnMapping = detectColumnMapping(worksheet);

      if (!columnMapping.firstName || !columnMapping.lastName || !columnMapping.grade) {
        errors.push({
          row: 0,
          message: `Sheet "${worksheet.name}": Could not detect student name or grade columns. Looking for columns like: First Name, Last Name, Grade, Student Name.`
        });
        continue;
      }

      if (columnMapping.goalColumns.length === 0) {
        errors.push({
          row: 0,
          message: `Sheet "${worksheet.name}": Could not detect IEP goal columns. Looking for columns containing: Goal, IEP, Objective, Target.`
        });
        continue;
      }

      // Process each row
      worksheet.eachRow((row, rowNumber) => {
        // Skip header rows (first 5 rows typically contain headers/metadata)
        if (rowNumber <= 5) return;

        try {
          const firstName = getCellValue(row, columnMapping.firstName!);
          const lastName = getCellValue(row, columnMapping.lastName!);
          const grade = getCellValue(row, columnMapping.grade!);
          const schoolOfAttendance = columnMapping.schoolOfAttendance
            ? getCellValue(row, columnMapping.schoolOfAttendance)
            : undefined;

          // Skip rows without student data
          if (!firstName || !lastName || !grade) return;

          // Extract goals from all goal columns, filtering by service type if applicable
          const goals: string[] = [];
          for (const goalColIndex of columnMapping.goalColumns) {
            // Check goal type column for service type filtering
            if (serviceTypeCode && columnMapping.goalType) {
              const goalType = getCellValue(row, columnMapping.goalType);
              if (goalType && !goalType.includes(serviceTypeCode)) {
                goalsFiltered++;
                continue; // Skip goals that don't match provider's service type
              }
            }

            const goalText = getCellValue(row, goalColIndex);
            if (goalText && goalText.trim().length > 10) {
              goals.push(goalText.trim());
            }
          }

          // Only process if they have at least one goal
          if (goals.length === 0) return;

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
              schoolOfAttendance: schoolOfAttendance?.trim() || undefined,
              rawRow: rowNumber
            });
          }
        } catch (error: any) {
          errors.push({
            row: rowNumber,
            message: `Error parsing row: ${error.message}`
          });
        }
      });
    } catch (error: any) {
      errors.push({
        row: 0,
        message: `Error processing sheet "${worksheet.name}": ${error.message}`
      });
    }
  }

  // Convert map to array
  students.push(...Array.from(studentMap.values()));

  return {
    students,
    errors,
    metadata: {
      totalRows: students.length + errors.length,
      sheetsProcessed,
      goalsFiltered
    }
  };
}

/**
 * Detect column mapping by analyzing headers
 */
function detectColumnMapping(worksheet: ExcelJS.Worksheet): ColumnMapping {
  const mapping: ColumnMapping = {
    goalColumns: []
  };

  // Common header patterns
  const firstNamePatterns = /first\s*name|firstname|student\s*first/i;
  const lastNamePatterns = /last\s*name|lastname|student\s*last|surname/i;
  const gradePatterns = /grade|grade\s*level|current\s*grade/i;
  const schoolPatterns = /school\s*of\s*attendance|school\s*name|attending\s*school|^school$/i;
  const goalTypePatterns = /annual\s*goal\s*#|goal\s*type|service\s*type|service\s*area/i;
  const goalPatterns = /goal|iep\s*goal|objective|target|present\s*level/i;

  // Check first 5 rows for headers
  for (let rowNum = 1; rowNum <= 5; rowNum++) {
    const row = worksheet.getRow(rowNum);

    row.eachCell((cell, colNumber) => {
      const cellValue = getCellValue(row, colNumber);
      if (!cellValue) return;

      const headerText = cellValue.toLowerCase();

      // Check for first name
      if (!mapping.firstName && firstNamePatterns.test(headerText)) {
        mapping.firstName = colNumber;
      }

      // Check for last name
      if (!mapping.lastName && lastNamePatterns.test(headerText)) {
        mapping.lastName = colNumber;
      }

      // Check for grade
      if (!mapping.grade && gradePatterns.test(headerText)) {
        mapping.grade = colNumber;
      }

      // Check for school of attendance
      if (!mapping.schoolOfAttendance && schoolPatterns.test(headerText)) {
        mapping.schoolOfAttendance = colNumber;
      }

      // Check for goal type / service type column
      if (!mapping.goalType && goalTypePatterns.test(headerText)) {
        mapping.goalType = colNumber;
      }

      // Check for goal columns
      if (goalPatterns.test(headerText)) {
        if (!mapping.goalColumns.includes(colNumber)) {
          mapping.goalColumns.push(colNumber);
        }
      }
    });

    // If we found the core columns, we're done
    if (mapping.firstName && mapping.lastName && mapping.grade) {
      break;
    }
  }

  return mapping;
}

/**
 * Get cell value as string
 */
function getCellValue(row: ExcelJS.Row, colNumber: number): string {
  const cell = row.getCell(colNumber);

  if (!cell || cell.value === null || cell.value === undefined) {
    return '';
  }

  // Handle different cell value types
  if (typeof cell.value === 'string') {
    return cell.value;
  }

  if (typeof cell.value === 'number') {
    return String(cell.value);
  }

  if (typeof cell.value === 'boolean') {
    return String(cell.value);
  }

  // Handle rich text
  if (typeof cell.value === 'object' && 'richText' in cell.value) {
    const richText = cell.value as ExcelRichTextValue;
    return richText.richText.map((t) => t.text).join('');
  }

  // Handle formula result
  if (typeof cell.value === 'object' && 'result' in cell.value) {
    const formula = cell.value as ExcelFormulaValue;
    return String(formula.result || '');
  }

  return String(cell.value);
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
