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
 * Handles multiple formats:
 * - Teacher#,<number>,Teacher: <Name>
 * - Teacher#,<number>,"Teacher: <Name>" (quoted, used when name contains comma)
 */
function isTeacherHeader(line: string): boolean {
  // Match with optional quote before "Teacher:"
  return /^Teacher#,\s*\d+,\s*"?Teacher:/i.test(line);
}

/**
 * Parse teacher header line
 * Handles multiple formats:
 * - Teacher#,<number>,Teacher: <Name>
 * - Teacher#,<number>,"Teacher: <Name>" (quoted, used when name contains comma)
 */
function parseTeacherHeader(line: string): TeacherInfo | null {
  // Try quoted format first: Teacher#,9,"Teacher: Massey,C"
  const quotedMatch = line.match(/^Teacher#,\s*(\d+),\s*"Teacher:\s*([^"]+)"?$/i);
  if (quotedMatch) {
    const teacherNumber = quotedMatch[1];
    const rawName = quotedMatch[2].trim();
    const { lastName, firstInitial } = parseTeacherName(rawName);

    return {
      rawName,
      lastName,
      firstInitial,
      teacherNumber
    };
  }

  // Try unquoted format: Teacher#,11,Teacher: Malibran
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
 * Normalize a name for comparison by removing special characters and extra whitespace
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // Remove non-alpha characters except spaces
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Check if two names are a partial match
 * Returns true if one name contains the other, or if they share significant overlap
 */
function isPartialMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) {
    return true;
  }

  // Check if they start with the same characters (at least 3)
  if (n1.length >= 3 && n2.length >= 3 && n1.substring(0, 3) === n2.substring(0, 3)) {
    return true;
  }

  return false;
}

/**
 * Match a teacher from the class list to existing teachers in the database
 * Uses a multi-step matching strategy:
 * 1. Exact last name match (high confidence)
 * 2. Partial/fuzzy last name match (low confidence)
 * 3. First initial validation when available
 *
 * @param classListTeacher - Teacher info from class list
 * @param dbTeachers - Array of teachers from database with id, first_name, last_name
 * @returns Matched teacher ID or null with confidence level
 */
export function matchTeacher(
  classListTeacher: TeacherInfo,
  dbTeachers: Array<{ id: string; first_name: string | null; last_name: string | null }>
): { teacherId: string | null; teacherName: string | null; confidence: 'high' | 'medium' | 'low' | 'none'; reason: string } {
  if (!classListTeacher.lastName) {
    return { teacherId: null, teacherName: null, confidence: 'none', reason: 'No teacher name provided' };
  }

  if (!dbTeachers || dbTeachers.length === 0) {
    return { teacherId: null, teacherName: null, confidence: 'none', reason: 'No teachers in database to match against' };
  }

  const targetLastName = normalizeName(classListTeacher.lastName);
  const targetFirstInitial = classListTeacher.firstInitial?.toUpperCase() || null;

  // Helper to get full name
  const getFullName = (t: { first_name: string | null; last_name: string | null }) =>
    [t.first_name, t.last_name].filter(Boolean).join(' ');

  // Step 1: Find teachers with exact last name match
  const exactMatches = dbTeachers.filter(
    (t) => t.last_name && normalizeName(t.last_name) === targetLastName
  );

  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    const fullName = getFullName(match);

    // Validate with first initial if available
    if (targetFirstInitial && match.first_name) {
      const dbFirstInitial = match.first_name.charAt(0).toUpperCase();
      if (dbFirstInitial === targetFirstInitial) {
        return {
          teacherId: match.id,
          teacherName: fullName,
          confidence: 'high',
          reason: `Matched by last name and first initial`
        };
      } else {
        return {
          teacherId: match.id,
          teacherName: fullName,
          confidence: 'medium',
          reason: `Only teacher with last name "${classListTeacher.lastName}" (initial mismatch)`
        };
      }
    }

    return {
      teacherId: match.id,
      teacherName: fullName,
      confidence: 'medium',
      reason: `Only teacher with last name "${classListTeacher.lastName}"`
    };
  }

  if (exactMatches.length > 1) {
    // Multiple exact matches - try to disambiguate with first initial
    if (targetFirstInitial) {
      const initialMatches = exactMatches.filter(
        (t) => t.first_name && t.first_name.charAt(0).toUpperCase() === targetFirstInitial
      );

      if (initialMatches.length === 1) {
        return {
          teacherId: initialMatches[0].id,
          teacherName: getFullName(initialMatches[0]),
          confidence: 'high',
          reason: `Matched by last name and first initial`
        };
      }

      if (initialMatches.length > 1) {
        return {
          teacherId: null,
          teacherName: null,
          confidence: 'none',
          reason: `Multiple teachers match "${classListTeacher.lastName} ${targetFirstInitial}"`
        };
      }
    }

    return {
      teacherId: null,
      teacherName: null,
      confidence: 'none',
      reason: `Multiple teachers with last name "${classListTeacher.lastName}"`
    };
  }

  // Step 2: No exact match - try partial/fuzzy matching
  const partialMatches = dbTeachers.filter(
    (t) => t.last_name && isPartialMatch(t.last_name, classListTeacher.lastName)
  );

  if (partialMatches.length === 1) {
    const match = partialMatches[0];
    const fullName = getFullName(match);

    // Validate with first initial if available
    if (targetFirstInitial && match.first_name) {
      const dbFirstInitial = match.first_name.charAt(0).toUpperCase();
      if (dbFirstInitial === targetFirstInitial) {
        return {
          teacherId: match.id,
          teacherName: fullName,
          confidence: 'low',
          reason: `Partial match: "${classListTeacher.lastName}" → "${match.last_name}" (initial confirmed)`
        };
      }
    }

    return {
      teacherId: match.id,
      teacherName: fullName,
      confidence: 'low',
      reason: `Partial match: "${classListTeacher.lastName}" → "${match.last_name}"`
    };
  }

  if (partialMatches.length > 1 && targetFirstInitial) {
    // Multiple partial matches - try first initial
    const initialMatches = partialMatches.filter(
      (t) => t.first_name && t.first_name.charAt(0).toUpperCase() === targetFirstInitial
    );

    if (initialMatches.length === 1) {
      return {
        teacherId: initialMatches[0].id,
        teacherName: getFullName(initialMatches[0]),
        confidence: 'low',
        reason: `Partial match with initial: "${classListTeacher.lastName} ${targetFirstInitial}" → "${getFullName(initialMatches[0])}"`
      };
    }
  }

  return {
    teacherId: null,
    teacherName: null,
    confidence: 'none',
    reason: `No match found for "${classListTeacher.lastName}${targetFirstInitial ? ' ' + targetFirstInitial : ''}"`
  };
}
