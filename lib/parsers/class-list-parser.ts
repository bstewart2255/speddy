/**
 * Aeries Class List Parser
 * Parses Aeries PrintSpecialEducationClassList TXT files to extract teacher assignments
 */

import { normalizeStudentName } from './name-utils';

export interface TeacherInfo {
  rawName: string;
  lastName: string;
  firstInitial: string | null;
  teacherNumber: string;
}

export interface ClassListStudent {
  normalizedName: string;
  name: string;
  teacher: TeacherInfo;
}

export interface ClassListParseResult {
  students: Map<string, ClassListStudent>; // Keyed by normalized name
  teachers: TeacherInfo[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  metadata: {
    totalStudents: number;
    totalTeachers: number;
  };
}

/**
 * Parse teacher name from Aeries format
 * Handles various formats:
 * - "Barrera E" (last name + space + first initial)
 * - "Batra" (last name only)
 * - "Khristo,G" (last name,first initial)
 * - "Davis/Winbery" (co-teachers - use first teacher)
 */
export function parseTeacherName(rawName: string): { lastName: string; firstInitial: string | null } {
  if (!rawName || typeof rawName !== 'string') {
    return { lastName: '', firstInitial: null };
  }

  let name = rawName.trim();

  // Handle co-teachers (e.g., "Davis/Winbery") - use first teacher
  if (name.includes('/')) {
    name = name.split('/')[0].trim();
  }

  // Remove quotes if present
  name = name.replace(/^["']|["']$/g, '').trim();

  // Pattern 1: "LastName,Initial" (comma-separated, no space)
  const commaMatch = name.match(/^([^,]+),\s*([A-Z])$/i);
  if (commaMatch) {
    return {
      lastName: commaMatch[1].trim(),
      firstInitial: commaMatch[2].toUpperCase()
    };
  }

  // Pattern 2: "LastName Initial" (space-separated)
  const spaceMatch = name.match(/^(.+)\s+([A-Z])$/i);
  if (spaceMatch) {
    return {
      lastName: spaceMatch[1].trim(),
      firstInitial: spaceMatch[2].toUpperCase()
    };
  }

  // Pattern 3: Just last name
  return {
    lastName: name,
    firstInitial: null
  };
}

/**
 * Check if a line is a teacher header
 * Format: "Teacher#,<number>,Teacher: <Name>"
 */
function isTeacherHeader(line: string): boolean {
  return /^Teacher#,\s*\d+,\s*Teacher:/i.test(line);
}

/**
 * Parse teacher header line
 * Format: "Teacher#,<number>,Teacher: <Name>"
 */
function parseTeacherHeader(line: string): TeacherInfo | null {
  const match = line.match(/^Teacher#,\s*(\d+),\s*Teacher:\s*(.+)$/i);
  if (!match) return null;

  const teacherNumber = match[1];
  const rawName = match[2].trim();
  const { lastName, firstInitial } = parseTeacherName(rawName);

  return {
    rawName,
    lastName,
    firstInitial,
    teacherNumber
  };
}

/**
 * Check if a line is a student data row
 * Student rows start with a quoted name containing a comma
 */
function isStudentRow(line: string): boolean {
  return /^"[^"]+,[^"]+"/.test(line);
}

/**
 * Parse student name from row
 * Format: "LastName, FirstName",other,data...
 */
function parseStudentFromRow(line: string): string | null {
  const match = line.match(/^"([^"]+)"/);
  if (!match) return null;
  return match[1];
}

/**
 * Parse Aeries Class List TXT buffer
 */
export async function parseClassListTXT(buffer: Buffer): Promise<ClassListParseResult> {
  const content = buffer.toString('utf-8');
  const lines = content.split(/\r?\n/);

  const students = new Map<string, ClassListStudent>();
  const teachers: TeacherInfo[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];

  let currentTeacher: TeacherInfo | null = null;
  const seenTeachers = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const rowNum = i + 1;

    try {
      // Check for teacher header
      if (isTeacherHeader(line)) {
        const teacherInfo = parseTeacherHeader(line);
        if (teacherInfo) {
          currentTeacher = teacherInfo;

          // Track unique teachers
          const teacherKey = `${teacherInfo.lastName}_${teacherInfo.firstInitial || ''}`.toLowerCase();
          if (!seenTeachers.has(teacherKey)) {
            seenTeachers.add(teacherKey);
            teachers.push(teacherInfo);
          }
        } else {
          warnings.push({ row: rowNum, message: `Could not parse teacher header: ${line}` });
        }
        continue;
      }

      // Check for student row
      if (isStudentRow(line) && currentTeacher) {
        const studentName = parseStudentFromRow(line);
        if (studentName) {
          const normalizedName = normalizeStudentName(studentName);

          if (normalizedName) {
            // Only add if we don't already have this student
            // (students might appear multiple times if data spans pages)
            if (!students.has(normalizedName)) {
              students.set(normalizedName, {
                normalizedName,
                name: studentName,
                teacher: currentTeacher
              });
            }
          } else {
            warnings.push({ row: rowNum, message: `Could not normalize student name: ${studentName}` });
          }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ row: rowNum, message: `Error parsing row: ${message}` });
    }
  }

  return {
    students,
    teachers,
    errors,
    warnings,
    metadata: {
      totalStudents: students.size,
      totalTeachers: teachers.length
    }
  };
}

/**
 * Match a teacher from the class list to existing teachers in the database
 *
 * @param classListTeacher - Teacher info from class list
 * @param dbTeachers - Array of teachers from database with id, first_name, last_name
 * @returns Matched teacher ID or null
 */
export function matchTeacher(
  classListTeacher: TeacherInfo,
  dbTeachers: Array<{ id: string; first_name: string | null; last_name: string | null }>
): { teacherId: string | null; confidence: 'high' | 'medium' | 'low' | 'none'; reason: string } {
  if (!classListTeacher.lastName) {
    return { teacherId: null, confidence: 'none', reason: 'No teacher name provided' };
  }

  const targetLastName = classListTeacher.lastName.toLowerCase();
  const targetFirstInitial = classListTeacher.firstInitial?.toUpperCase() || null;

  // Find teachers with matching last name
  const lastNameMatches = dbTeachers.filter(
    (t) => t.last_name && t.last_name.toLowerCase() === targetLastName
  );

  if (lastNameMatches.length === 0) {
    return { teacherId: null, confidence: 'none', reason: `No teacher with last name "${classListTeacher.lastName}"` };
  }

  if (lastNameMatches.length === 1) {
    // Only one teacher with this last name
    const match = lastNameMatches[0];

    // Check if first initial matches (if provided)
    if (targetFirstInitial && match.first_name) {
      const dbFirstInitial = match.first_name.charAt(0).toUpperCase();
      if (dbFirstInitial === targetFirstInitial) {
        return {
          teacherId: match.id,
          confidence: 'high',
          reason: `Matched by last name and first initial`
        };
      } else {
        return {
          teacherId: match.id,
          confidence: 'medium',
          reason: `Only teacher with last name "${classListTeacher.lastName}" (first initial mismatch: expected ${targetFirstInitial}, got ${dbFirstInitial})`
        };
      }
    }

    return {
      teacherId: match.id,
      confidence: 'medium',
      reason: `Only teacher with last name "${classListTeacher.lastName}"`
    };
  }

  // Multiple teachers with same last name - need to match by first initial
  if (targetFirstInitial) {
    const firstInitialMatches = lastNameMatches.filter(
      (t) => t.first_name && t.first_name.charAt(0).toUpperCase() === targetFirstInitial
    );

    if (firstInitialMatches.length === 1) {
      return {
        teacherId: firstInitialMatches[0].id,
        confidence: 'high',
        reason: `Matched by last name and first initial`
      };
    }

    if (firstInitialMatches.length > 1) {
      return {
        teacherId: null,
        confidence: 'none',
        reason: `Multiple teachers with last name "${classListTeacher.lastName}" and initial "${targetFirstInitial}"`
      };
    }
  }

  return {
    teacherId: null,
    confidence: 'none',
    reason: `Multiple teachers with last name "${classListTeacher.lastName}", cannot determine which one`
  };
}
