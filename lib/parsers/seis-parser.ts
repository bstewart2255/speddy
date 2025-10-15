/**
 * SEIS IEP Goals Parser
 * Parses SEIS (IEP management software) Excel reports to extract student IEP goals
 */

import * as ExcelJS from 'exceljs';

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
    sheetsProcessed: string[];
  };
}

interface ColumnMapping {
  firstName?: number;
  lastName?: number;
  grade?: number;
  goalColumns: number[];
}

/**
 * Parse SEIS Excel file and extract student IEP goals
 */
export async function parseSEISReport(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const students: ParsedStudent[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const sheetsProcessed: string[] = [];

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

          // Skip rows without student data
          if (!firstName || !lastName || !grade) return;

          // Extract goals from all goal columns
          const goals: string[] = [];
          for (const goalColIndex of columnMapping.goalColumns) {
            const goalText = getCellValue(row, goalColIndex);
            if (goalText && goalText.trim().length > 10) {
              goals.push(goalText.trim());
            }
          }

          // Only add student if they have at least one goal
          if (goals.length === 0) return;

          // Generate initials
          const initials = `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;

          // Normalize grade level
          const normalizedGrade = normalizeGradeLevel(grade);

          students.push({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            initials,
            gradeLevel: normalizedGrade,
            goals,
            rawRow: rowNumber
          });
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

  return {
    students,
    errors,
    metadata: {
      totalRows: students.length + errors.length,
      sheetsProcessed
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
    const richText = cell.value as any;
    return richText.richText.map((t: any) => t.text).join('');
  }

  // Handle formula result
  if (typeof cell.value === 'object' && 'result' in cell.value) {
    const formula = cell.value as any;
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
