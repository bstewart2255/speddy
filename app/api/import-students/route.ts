/**
 * Student Import Preview API
 * Handles bulk student import from SEIS/CSV files
 * Supports multi-file upload: Student Goals, Deliveries, Class List (all optional, at least one required)
 * - With Student Goals: Creates/updates students with goals, optionally enriched with deliveries/teacher data
 * - Without Student Goals: Updates existing students with deliveries/teacher data only
 * Returns preview data for user review before creating/updating students
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { parseSEISReport } from '@/lib/parsers/seis-parser';
import { parseCSVReport } from '@/lib/parsers/csv-parser';
import { parseDeliveriesCSV, DeliveryRecord } from '@/lib/parsers/deliveries-parser';
import { parseClassListTXT, ClassListStudent, matchTeacher } from '@/lib/parsers/class-list-parser';
import { createNormalizedKey } from '@/lib/parsers/name-utils';
import { matchStudents, DatabaseStudent } from '@/lib/utils/student-matcher';
import { scrubPIIFromGoals } from '@/lib/utils/pii-scrubber';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

export const runtime = 'nodejs';

interface TeacherMatch {
  teacherId: string | null;
  teacherName: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

interface ScheduleData {
  sessionsPerWeek: number;
  minutesPerSession: number;
  weeklyMinutes: number;
  frequency: string;
}

interface GoalChange {
  added: string[];
  removed: string[];
  unchanged: string[];
}

interface ScheduleChange {
  old: { sessionsPerWeek?: number; minutesPerSession?: number } | null;
  new: { sessionsPerWeek: number; minutesPerSession: number } | null;
}

interface TeacherChange {
  old: { teacherId?: string; teacherName?: string } | null;
  new: { teacherId: string | null; teacherName: string | null } | null;
}

interface StudentChanges {
  goals?: GoalChange;
  schedule?: ScheduleChange;
  teacher?: TeacherChange;
}

interface StudentPreview {
  firstName: string;
  lastName: string;
  initials: string; // Generated, but editable in UI
  gradeLevel: string;
  goals: Array<{
    scrubbed: string;
    piiDetected: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  // UPSERT action: insert (new), update (existing with changes), skip (existing, no changes)
  action: 'insert' | 'update' | 'skip';
  // Legacy field for backward compatibility
  matchStatus: 'new' | 'duplicate';
  matchedStudentId?: string; // If duplicate/update, the ID of existing student
  matchedStudentInitials?: string; // If duplicate/update, the initials of existing student
  matchConfidence?: 'high' | 'medium' | 'low'; // If duplicate/update, confidence level
  matchReason?: string; // If duplicate/update, reason for match
  // Changes tracking for updates
  changes?: StudentChanges;
  // Warning if goals are being removed
  goalsRemoved?: string[];
  // New fields from Deliveries file
  schedule?: ScheduleData;
  // New fields from Class List file
  teacher?: TeacherMatch;
}

interface UnmatchedStudent {
  name: string;
  source: 'deliveries' | 'classList';
}

/**
 * Compare two arrays of goals to determine what's changed
 * Goals are compared by normalized text (lowercase, trimmed)
 */
function compareGoals(existingGoals: string[] | undefined, newGoals: string[]): GoalChange {
  const existing = (existingGoals || []).map(g => g.toLowerCase().trim());
  const incoming = newGoals.map(g => g.toLowerCase().trim());

  const existingSet = new Set(existing);
  const incomingSet = new Set(incoming);

  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  // Find added goals (in new but not in existing)
  for (let i = 0; i < newGoals.length; i++) {
    const normalizedGoal = incoming[i];
    if (!existingSet.has(normalizedGoal)) {
      added.push(newGoals[i]);
    } else {
      unchanged.push(newGoals[i]);
    }
  }

  // Find removed goals (in existing but not in new)
  for (let i = 0; i < (existingGoals || []).length; i++) {
    const normalizedGoal = existing[i];
    if (!incomingSet.has(normalizedGoal)) {
      removed.push(existingGoals![i]);
    }
  }

  return { added, removed, unchanged };
}

/**
 * Determine if there are any meaningful changes between existing and new data
 */
function hasChanges(
  existingStudent: DatabaseStudent,
  newGoals: string[],
  newSchedule?: { sessionsPerWeek: number; minutesPerSession: number },
  newTeacherId?: string | null
): { hasGoalChanges: boolean; hasScheduleChanges: boolean; hasTeacherChanges: boolean } {
  // Compare goals
  const goalComparison = compareGoals(existingStudent.iep_goals, newGoals);
  const hasGoalChanges = goalComparison.added.length > 0 || goalComparison.removed.length > 0;

  // Compare schedule
  let hasScheduleChanges = false;
  if (newSchedule) {
    hasScheduleChanges =
      existingStudent.sessions_per_week !== newSchedule.sessionsPerWeek ||
      existingStudent.minutes_per_session !== newSchedule.minutesPerSession;
  }

  // Compare teacher
  let hasTeacherChanges = false;
  if (newTeacherId !== undefined) {
    hasTeacherChanges = existingStudent.teacher_id !== newTeacherId;
  }

  return { hasGoalChanges, hasScheduleChanges, hasTeacherChanges };
}

// Helper function to handle when only deliveries or class list files are uploaded
async function handleDeliveriesOrClassListOnly(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  deliveriesFile: File | null,
  classListFile: File | null,
  currentSchoolId: string | null,
  perf: ReturnType<typeof measurePerformanceWithAlerts>
) {
  log.info('Processing deliveries/classList only mode', {
    userId,
    hasDeliveries: !!deliveriesFile,
    hasClassList: !!classListFile
  });

  // Get user's role for service type filtering
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const providerRole = userProfile?.role || 'resource';

  // Get existing students with their details (names) for matching
  const { data: dbStudents, error: dbError } = await supabase
    .from('students')
    .select(`
      id,
      initials,
      grade_level,
      school_site,
      school_id,
      student_details!inner(first_name, last_name)
    `)
    .eq('provider_id', userId);

  if (dbError) {
    log.error('Failed to fetch students', dbError, { userId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Failed to fetch your students from database' },
      { status: 500 }
    );
  }

  if (!dbStudents || dbStudents.length === 0) {
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'No existing students found. Please upload a Student Goals file first to create students.' },
      { status: 400 }
    );
  }

  // Build a map of normalized names -> student for matching
  const studentsByName = new Map<string, typeof dbStudents[0]>();
  for (const student of dbStudents) {
    const details = student.student_details as unknown as { first_name: string | null; last_name: string | null } | null;
    if (details?.first_name && details?.last_name) {
      const normalizedKey = createNormalizedKey(details.first_name, details.last_name);
      studentsByName.set(normalizedKey, student);
    }
  }

  // Parse deliveries file if provided
  let deliveriesData: Map<string, DeliveryRecord> | null = null;
  const deliveriesWarnings: Array<{ row: number; message: string }> = [];
  if (deliveriesFile) {
    try {
      const deliveriesBytes = await deliveriesFile.arrayBuffer();
      const deliveriesBuffer = Buffer.from(deliveriesBytes);
      const deliveriesResult = await parseDeliveriesCSV(deliveriesBuffer, { providerRole });
      deliveriesData = deliveriesResult.deliveries;
      deliveriesWarnings.push(...deliveriesResult.warnings);

      log.info('Deliveries file parsed (standalone)', {
        userId,
        totalStudents: deliveriesResult.metadata.uniqueStudents,
        filteredServiceRows: deliveriesResult.metadata.filteredServiceRows,
        serviceTypeCode: deliveriesResult.metadata.serviceTypeCode
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to parse deliveries file', error instanceof Error ? error : null, { userId });
      perf.end({ success: false });
      return NextResponse.json(
        { error: `Failed to parse deliveries file: ${message}` },
        { status: 400 }
      );
    }
  }

  // Parse class list file if provided
  let classListData: Map<string, ClassListStudent> | null = null;
  const classListWarnings: Array<{ row: number; message: string }> = [];
  if (classListFile) {
    try {
      const classListBytes = await classListFile.arrayBuffer();
      const classListBuffer = Buffer.from(classListBytes);
      const classListResult = await parseClassListTXT(classListBuffer);
      classListData = classListResult.students;
      classListWarnings.push(...classListResult.warnings);

      log.info('Class list file parsed (standalone)', {
        userId,
        totalStudents: classListResult.metadata.totalStudents,
        totalTeachers: classListResult.metadata.totalTeachers
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to parse class list file', error instanceof Error ? error : null, { userId });
      perf.end({ success: false });
      return NextResponse.json(
        { error: `Failed to parse class list file: ${message}` },
        { status: 400 }
      );
    }
  }

  // Get teachers from database for matching
  let dbTeachers: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
  if (classListData && classListData.size > 0) {
    const { data: teachers } = await supabase
      .from('teachers')
      .select('id, first_name, last_name')
      .eq('school_id', currentSchoolId || '');

    dbTeachers = teachers || [];
  }

  // Build student updates preview
  interface StudentUpdate {
    studentId: string;
    initials: string;
    firstName: string;
    lastName: string;
    gradeLevel: string | null;
    action: 'update'; // Always 'update' for Deliveries/ClassList-only mode
    matchStatus: 'duplicate'; // These are existing students being updated
    schedule?: {
      sessionsPerWeek: number;
      minutesPerSession: number;
      weeklyMinutes: number;
      frequency: string;
    };
    teacher?: {
      teacherId: string | null;
      teacherName: string | null;
      confidence: 'high' | 'medium' | 'low' | 'none';
      reason: string;
    };
  }

  const studentUpdates: StudentUpdate[] = [];
  const matchedDeliveryNames = new Set<string>();
  const matchedClassListNames = new Set<string>();
  const unmatchedStudents: UnmatchedStudent[] = [];

  // Match deliveries to existing students
  if (deliveriesData) {
    for (const [normalizedName, record] of deliveriesData) {
      const existingStudent = studentsByName.get(normalizedName);
      if (existingStudent) {
        matchedDeliveryNames.add(normalizedName);
        const details = existingStudent.student_details as unknown as { first_name: string; last_name: string };

        // Find or create update entry
        let update = studentUpdates.find(u => u.studentId === existingStudent.id);
        if (!update) {
          update = {
            studentId: existingStudent.id,
            initials: existingStudent.initials || '',
            firstName: details.first_name,
            lastName: details.last_name,
            gradeLevel: existingStudent.grade_level,
            action: 'update',
            matchStatus: 'duplicate'
          };
          studentUpdates.push(update);
        }

        update.schedule = {
          sessionsPerWeek: record.sessionsPerWeek,
          minutesPerSession: record.minutesPerSession,
          weeklyMinutes: record.weeklyMinutes,
          frequency: record.sessionsFrequency
        };
      } else {
        unmatchedStudents.push({
          name: record.name,
          source: 'deliveries'
        });
      }
    }
  }

  // Match class list to existing students
  if (classListData) {
    for (const [normalizedName, student] of classListData) {
      const existingStudent = studentsByName.get(normalizedName);
      if (existingStudent) {
        matchedClassListNames.add(normalizedName);
        const details = existingStudent.student_details as unknown as { first_name: string; last_name: string };

        // Find or create update entry
        let update = studentUpdates.find(u => u.studentId === existingStudent.id);
        if (!update) {
          update = {
            studentId: existingStudent.id,
            initials: existingStudent.initials || '',
            firstName: details.first_name,
            lastName: details.last_name,
            gradeLevel: existingStudent.grade_level,
            action: 'update',
            matchStatus: 'duplicate'
          };
          studentUpdates.push(update);
        }

        // Match teacher to database
        const teacherMatch = matchTeacher(student.teacher, dbTeachers);
        let teacherName: string | null = null;
        if (teacherMatch.teacherId) {
          const dbTeacher = dbTeachers.find(t => t.id === teacherMatch.teacherId);
          if (dbTeacher) {
            teacherName = [dbTeacher.first_name, dbTeacher.last_name].filter(Boolean).join(' ');
          }
        }

        update.teacher = {
          teacherId: teacherMatch.teacherId,
          teacherName: teacherName || student.teacher.rawName,
          confidence: teacherMatch.confidence,
          reason: teacherMatch.reason
        };
      } else {
        unmatchedStudents.push({
          name: student.name,
          source: 'classList'
        });
      }
    }
  }

  // Track event
  track.event('student_update_preview_generated', {
    userId,
    totalUpdates: studentUpdates.length,
    withSchedule: studentUpdates.filter(s => s.schedule).length,
    withTeacher: studentUpdates.filter(s => s.teacher).length,
    unmatchedCount: unmatchedStudents.length,
    hasDeliveriesFile: !!deliveriesFile,
    hasClassListFile: !!classListFile
  });

  log.info('Preparing update preview response', {
    userId,
    totalUpdates: studentUpdates.length,
    unmatchedCount: unmatchedStudents.length
  });

  perf.end({ success: true });

  // Combine warnings
  const allWarnings = [
    ...deliveriesWarnings.map(w => ({ ...w, source: 'deliveries' as const })),
    ...classListWarnings.map(w => ({ ...w, source: 'classList' as const }))
  ];

  // Return update preview
  return NextResponse.json({
    success: true,
    mode: 'update', // Indicate this is an update-only operation
    data: {
      students: studentUpdates,
      summary: {
        total: studentUpdates.length,
        new: 0,
        duplicates: studentUpdates.length,
        // UPSERT counts for consistency
        inserts: 0,
        updates: studentUpdates.length,
        skips: 0,
        withSchedule: studentUpdates.filter(s => s.schedule).length,
        withTeacher: studentUpdates.filter(s => s.teacher).length
      },
      unmatchedStudents: unmatchedStudents.length > 0 ? unmatchedStudents.slice(0, 20) : [],
      parseErrors: [],
      parseWarnings: allWarnings.length > 0 ? allWarnings.slice(0, 10) : [],
      scrubErrors: []
    }
  });
}

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('import_students_preview', 'api');

  try {
    const supabase = await createClient();

    // Get form data - now supports multiple files
    const formData = await request.formData();
    const studentsFile = formData.get('studentsFile') as File | null;
    const deliveriesFile = formData.get('deliveriesFile') as File | null;
    const classListFile = formData.get('classListFile') as File | null;
    const currentSchoolId = formData.get('currentSchoolId') as string | null;
    const currentSchoolSite = formData.get('currentSchoolSite') as string | null;

    // Backward compatibility: also check for 'file' key
    const legacyFile = formData.get('file') as File | null;
    const file = studentsFile || legacyFile;

    log.info('Processing student import preview', {
      userId,
      studentsFile: file?.name,
      deliveriesFile: deliveriesFile?.name,
      classListFile: classListFile?.name,
      currentSchoolId,
      currentSchoolSite
    });

    // Check if at least one file is provided
    if (!file && !deliveriesFile && !classListFile) {
      log.warn('No files provided in student import request', { userId });
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // If no students file, handle deliveries/classList only mode
    if (!file) {
      return await handleDeliveriesOrClassListOnly(
        userId,
        supabase,
        deliveriesFile,
        classListFile,
        currentSchoolId,
        perf
      );
    }

    // Validate file type for students file
    const validExcelTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const validCSVTypes = [
      'text/csv',
      'text/plain',
      'application/csv'
    ];

    const isExcel = validExcelTypes.includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCSV = validCSVTypes.includes(file.type) || file.name.endsWith('.csv');

    if (!isExcel && !isCSV) {
      log.warn('Invalid file type for student import', {
        userId,
        fileType: file.type,
        fileName: file.name
      });

      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls) or CSV file (.csv)' },
        { status: 400 }
      );
    }

    // Convert files to buffers
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get user profile to check if they work at multiple schools and get their role
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('works_at_multiple_schools, role')
      .eq('id', userId)
      .single();

    if (profileError) {
      log.error('Failed to fetch user profile', profileError, { userId });
    }

    // Get existing students from database to detect duplicates
    log.info('Fetching existing students for duplicate detection', { userId });
    const dbPerf = measurePerformanceWithAlerts('fetch_students', 'database');

    const { data: dbStudents, error: dbError } = await supabase
      .from('students')
      .select('id, initials, grade_level, school_site, school_id, sessions_per_week, minutes_per_session, teacher_id')
      .eq('provider_id', userId);

    dbPerf.end({ success: !dbError });

    if (dbError) {
      log.error('Failed to fetch students', dbError, { userId });
      return NextResponse.json(
        { error: 'Failed to fetch your students from database' },
        { status: 500 }
      );
    }

    // Parse the students file
    let userSchools: string[] | undefined;
    if (isCSV && userProfile?.works_at_multiple_schools && dbStudents && dbStudents.length > 0) {
      userSchools = Array.from(
        new Set(
          dbStudents
            .map(s => s.school_site)
            .filter((site): site is string => site !== null && site !== undefined && site.trim() !== '')
        )
      );

      log.info('Multi-school user detected, extracted school sites', {
        userId,
        schoolCount: userSchools.length,
        schools: userSchools
      });
    }

    const fileType = isCSV ? 'CSV' : 'Excel';
    log.info(`Parsing ${fileType} file`, { userId, fileName: file.name });
    const parsePerf = measurePerformanceWithAlerts(`parse_${fileType.toLowerCase()}`, 'api');

    let parseResult;
    try {
      if (isCSV) {
        parseResult = await parseCSVReport(buffer, {
          userSchools,
          providerRole: userProfile?.role
        });
      } else {
        parseResult = await parseSEISReport(buffer);
      }

      parsePerf.end({ success: true });

      log.info(`${fileType} parsing complete`, {
        userId,
        studentsFound: parseResult.students.length,
        errors: parseResult.errors.length,
        warnings: parseResult.warnings?.length || 0
      });
    } catch (error: unknown) {
      parsePerf.end({ success: false });
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`${fileType} parsing failed`, error instanceof Error ? error : null, { userId, fileName: file.name });

      return NextResponse.json(
        {
          error: `Failed to parse ${fileType} file: ${message}. Please ensure the file contains student names, grades, and IEP goals.`
        },
        { status: 400 }
      );
    }

    if (parseResult.students.length === 0) {
      log.warn(`No students found in ${fileType} file`, { userId, fileName: file.name });

      return NextResponse.json(
        {
          error: 'No students with IEP goals found in the file. Please check that the file contains columns for student names, grades, and IEP goals.',
          parseErrors: parseResult.errors,
          parseWarnings: parseResult.warnings || []
        },
        { status: 400 }
      );
    }

    // Filter students by current school (for multi-school users)
    // This ensures users only import students belonging to their currently selected school
    let filteredStudents = parseResult.students;
    let filteredOutCount = 0;
    let filteredOutSchools: string[] = [];

    if (currentSchoolSite && userProfile?.works_at_multiple_schools) {
      const normalizedCurrentSchool = currentSchoolSite.toLowerCase().trim();

      const beforeCount = filteredStudents.length;
      filteredStudents = filteredStudents.filter(student => {
        // If student has no school info, include them (they'll be assigned to current school)
        if (!student.schoolOfAttendance) return true;

        const studentSchool = student.schoolOfAttendance.toLowerCase().trim();
        return studentSchool === normalizedCurrentSchool;
      });

      filteredOutCount = beforeCount - filteredStudents.length;

      // Track which schools were filtered out
      if (filteredOutCount > 0) {
        const otherSchools = new Set<string>();
        for (const student of parseResult.students) {
          if (student.schoolOfAttendance) {
            const studentSchool = student.schoolOfAttendance.toLowerCase().trim();
            if (studentSchool !== normalizedCurrentSchool) {
              otherSchools.add(student.schoolOfAttendance);
            }
          }
        }
        filteredOutSchools = Array.from(otherSchools);

        log.info('Filtered students by school', {
          userId,
          currentSchool: currentSchoolSite,
          beforeCount,
          afterCount: filteredStudents.length,
          filteredOut: filteredOutCount,
          otherSchools: filteredOutSchools
        });
      }

      // Update parseResult to use filtered students
      parseResult.students = filteredStudents;

      // If all students were filtered out, return a helpful error
      if (filteredStudents.length === 0 && filteredOutCount > 0) {
        log.warn('All students filtered out by school', {
          userId,
          currentSchool: currentSchoolSite,
          filteredOut: filteredOutCount,
          otherSchools: filteredOutSchools
        });

        return NextResponse.json(
          {
            error: `All ${filteredOutCount} students in this file belong to other schools (${filteredOutSchools.join(', ')}). Please switch to the correct school or upload a file with students from ${currentSchoolSite}.`,
            filteredOutSchools
          },
          { status: 400 }
        );
      }
    }

    // Parse optional Deliveries file
    let deliveriesData: Map<string, DeliveryRecord> | null = null;
    const deliveriesWarnings: Array<{ row: number; message: string }> = [];
    if (deliveriesFile) {
      try {
        const deliveriesBytes = await deliveriesFile.arrayBuffer();
        const deliveriesBuffer = Buffer.from(deliveriesBytes);
        const deliveriesResult = await parseDeliveriesCSV(deliveriesBuffer, {
          providerRole: userProfile?.role
        });
        deliveriesData = deliveriesResult.deliveries;
        deliveriesWarnings.push(...deliveriesResult.warnings);

        log.info('Deliveries file parsed', {
          userId,
          totalStudents: deliveriesResult.metadata.uniqueStudents,
          filteredServiceRows: deliveriesResult.metadata.filteredServiceRows,
          serviceTypeCode: deliveriesResult.metadata.serviceTypeCode
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error('Failed to parse deliveries file', error instanceof Error ? error : null, { userId });
        deliveriesWarnings.push({ row: 0, message: `Failed to parse deliveries file: ${message}` });
      }
    }

    // Parse optional Class List file
    let classListData: Map<string, ClassListStudent> | null = null;
    const classListWarnings: Array<{ row: number; message: string }> = [];
    if (classListFile) {
      try {
        const classListBytes = await classListFile.arrayBuffer();
        const classListBuffer = Buffer.from(classListBytes);
        const classListResult = await parseClassListTXT(classListBuffer);
        classListData = classListResult.students;
        classListWarnings.push(...classListResult.warnings);

        log.info('Class list file parsed', {
          userId,
          totalStudents: classListResult.metadata.totalStudents,
          totalTeachers: classListResult.metadata.totalTeachers
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error('Failed to parse class list file', error instanceof Error ? error : null, { userId });
        classListWarnings.push({ row: 0, message: `Failed to parse class list file: ${message}` });
      }
    }

    // Get teachers from database for matching
    let dbTeachers: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
    if (classListData && classListData.size > 0) {
      const { data: teachers } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')
        .eq('school_id', currentSchoolId || '');

      dbTeachers = teachers || [];

      log.info('Fetched teachers for matching', {
        userId,
        teacherCount: dbTeachers.length
      });
    }

    // Get student details for names, goals (for UPSERT comparison)
    const { data: studentDetails } = dbStudents && dbStudents.length > 0 ? await supabase
      .from('student_details')
      .select('student_id, first_name, last_name, iep_goals')
      .in('student_id', dbStudents.map(s => s.id)) : { data: null };

    // Combine students with their details for matching (includes goals for UPSERT comparison)
    const databaseStudents: DatabaseStudent[] = dbStudents?.map(student => {
      const details = studentDetails?.find(d => d.student_id === student.id);
      return {
        id: student.id,
        initials: student.initials,
        grade_level: student.grade_level,
        first_name: details?.first_name || undefined,
        last_name: details?.last_name || undefined,
        // For UPSERT comparison
        iep_goals: details?.iep_goals || undefined,
        sessions_per_week: student.sessions_per_week || undefined,
        minutes_per_session: student.minutes_per_session || undefined,
        teacher_id: student.teacher_id || undefined
      };
    }) || [];

    // Match parsed students to database students for duplicate detection
    log.info('Matching students for duplicate detection', {
      userId,
      parsedCount: parseResult.students.length,
      databaseCount: databaseStudents.length
    });

    const matchPerf = measurePerformanceWithAlerts('match_students', 'api');
    const matchResult = matchStudents(parseResult.students, databaseStudents);
    matchPerf.end({ success: true });

    log.info('Student matching complete', {
      userId,
      newStudents: matchResult.summary.noMatch,
      duplicates: matchResult.summary.highConfidence + matchResult.summary.mediumConfidence + matchResult.summary.lowConfidence
    });

    // Track which students from deliveries/classList were matched
    const matchedDeliveryNames = new Set<string>();
    const matchedClassListNames = new Set<string>();

    // Process each student: scrub PII from goals and prepare preview data
    const studentPreviews: StudentPreview[] = [];
    const scrubErrors: string[] = [];

    for (const match of matchResult.matches) {
      const student = match.excelStudent;

      // Create normalized key for matching across files
      const normalizedKey = createNormalizedKey(student.firstName, student.lastName);

      // Scrub PII from goals
      log.info('Scrubbing PII for student', {
        userId,
        studentInitials: student.initials,
        goalsCount: student.goals.length
      });

      const scrubPerf = measurePerformanceWithAlerts('scrub_pii', 'api');
      const scrubResult = await scrubPIIFromGoals(
        student.goals,
        student.firstName,
        student.lastName
      );
      scrubPerf.end({ success: scrubResult.errors.length === 0 });

      if (scrubResult.errors.length > 0) {
        scrubErrors.push(...scrubResult.errors);
      }

      // Determine match status and UPSERT action
      const isNew = match.confidence === 'none';
      const matchedStudent = match.matchedStudent;

      // Get scrubbed goal texts for comparison
      const scrubbedGoalTexts = scrubResult.goals.map(g => g.scrubbed);

      // Initialize preview with schedule/teacher data for change detection
      let scheduleData: { sessionsPerWeek: number; minutesPerSession: number } | undefined;
      let teacherMatchResult: TeacherMatch | undefined;

      // Match with deliveries data first (need for change detection)
      if (deliveriesData) {
        const deliveryRecord = deliveriesData.get(normalizedKey);
        if (deliveryRecord) {
          matchedDeliveryNames.add(normalizedKey);
          scheduleData = {
            sessionsPerWeek: deliveryRecord.sessionsPerWeek,
            minutesPerSession: deliveryRecord.minutesPerSession
          };
        }
      }

      // Match with class list data (need for change detection)
      if (classListData) {
        const classListStudent = classListData.get(normalizedKey);
        if (classListStudent) {
          matchedClassListNames.add(normalizedKey);
          const teacherMatch = matchTeacher(classListStudent.teacher, dbTeachers);
          let teacherName: string | null = null;
          if (teacherMatch.teacherId) {
            const dbTeacher = dbTeachers.find(t => t.id === teacherMatch.teacherId);
            if (dbTeacher) {
              teacherName = [dbTeacher.first_name, dbTeacher.last_name].filter(Boolean).join(' ');
            }
          }
          teacherMatchResult = {
            teacherId: teacherMatch.teacherId,
            teacherName: teacherName || classListStudent.teacher.rawName,
            confidence: teacherMatch.confidence,
            reason: teacherMatch.reason
          };
        }
      }

      // Determine action and track changes
      let action: 'insert' | 'update' | 'skip' = 'insert';
      let changes: StudentChanges | undefined;
      let goalsRemoved: string[] | undefined;

      if (!isNew && matchedStudent) {
        // Check for changes to determine if update or skip
        const changeCheck = hasChanges(
          matchedStudent,
          scrubbedGoalTexts,
          scheduleData,
          teacherMatchResult?.teacherId
        );

        const goalComparison = compareGoals(matchedStudent.iep_goals, scrubbedGoalTexts);
        const anyChanges = changeCheck.hasGoalChanges || changeCheck.hasScheduleChanges || changeCheck.hasTeacherChanges;

        if (anyChanges) {
          action = 'update';
          changes = {};

          // Track goal changes
          if (changeCheck.hasGoalChanges) {
            changes.goals = goalComparison;
            // Set warning if goals are being removed
            if (goalComparison.removed.length > 0) {
              goalsRemoved = goalComparison.removed;
            }
          }

          // Track schedule changes
          if (changeCheck.hasScheduleChanges && scheduleData) {
            changes.schedule = {
              old: matchedStudent.sessions_per_week || matchedStudent.minutes_per_session
                ? {
                    sessionsPerWeek: matchedStudent.sessions_per_week,
                    minutesPerSession: matchedStudent.minutes_per_session
                  }
                : null,
              new: scheduleData
            };
          }

          // Track teacher changes
          if (changeCheck.hasTeacherChanges && teacherMatchResult) {
            // Find existing teacher name for display
            let existingTeacherName: string | undefined;
            if (matchedStudent.teacher_id) {
              const existingTeacher = dbTeachers.find(t => t.id === matchedStudent.teacher_id);
              if (existingTeacher) {
                existingTeacherName = [existingTeacher.first_name, existingTeacher.last_name].filter(Boolean).join(' ');
              }
            }

            changes.teacher = {
              old: matchedStudent.teacher_id
                ? { teacherId: matchedStudent.teacher_id, teacherName: existingTeacherName }
                : null,
              new: {
                teacherId: teacherMatchResult.teacherId,
                teacherName: teacherMatchResult.teacherName
              }
            };
          }
        } else {
          action = 'skip';
        }
      }

      // Build preview object
      const preview: StudentPreview = {
        firstName: student.firstName,
        lastName: student.lastName,
        initials: student.initials,
        gradeLevel: student.gradeLevel,
        goals: scrubResult.goals,
        action,
        matchStatus: isNew ? 'new' : 'duplicate',
        matchedStudentId: isNew ? undefined : matchedStudent?.id,
        matchedStudentInitials: isNew ? undefined : matchedStudent?.initials,
        matchConfidence: isNew ? undefined : (match.confidence === 'none' ? undefined : match.confidence as 'high' | 'medium' | 'low'),
        matchReason: isNew ? undefined : match.reason,
        changes,
        goalsRemoved
      };

      // Add schedule data to preview
      if (scheduleData) {
        const deliveryRecord = deliveriesData?.get(normalizedKey);
        preview.schedule = {
          sessionsPerWeek: scheduleData.sessionsPerWeek,
          minutesPerSession: scheduleData.minutesPerSession,
          weeklyMinutes: deliveryRecord?.weeklyMinutes || scheduleData.sessionsPerWeek * scheduleData.minutesPerSession,
          frequency: deliveryRecord?.sessionsFrequency || `${scheduleData.sessionsPerWeek}x/week`
        };
      }

      // Add teacher data to preview
      if (teacherMatchResult) {
        preview.teacher = teacherMatchResult;
      }

      studentPreviews.push(preview);
    }

    // Collect unmatched students from deliveries and class list
    const unmatchedStudents: UnmatchedStudent[] = [];

    if (deliveriesData) {
      for (const [normalizedName, record] of deliveriesData) {
        if (!matchedDeliveryNames.has(normalizedName)) {
          unmatchedStudents.push({
            name: record.name,
            source: 'deliveries'
          });
        }
      }
    }

    if (classListData) {
      for (const [normalizedName, student] of classListData) {
        if (!matchedClassListNames.has(normalizedName)) {
          unmatchedStudents.push({
            name: student.name,
            source: 'classList'
          });
        }
      }
    }

    // Track preview generation with UPSERT counts
    track.event('student_import_preview_generated', {
      userId,
      totalStudents: studentPreviews.length,
      inserts: studentPreviews.filter(s => s.action === 'insert').length,
      updates: studentPreviews.filter(s => s.action === 'update').length,
      skips: studentPreviews.filter(s => s.action === 'skip').length,
      withGoalsRemoved: studentPreviews.filter(s => s.goalsRemoved && s.goalsRemoved.length > 0).length,
      withSchedule: studentPreviews.filter(s => s.schedule).length,
      withTeacher: studentPreviews.filter(s => s.teacher).length,
      hasDeliveriesFile: !!deliveriesFile,
      hasClassListFile: !!classListFile
    });

    log.info('Preparing UPSERT preview response', {
      userId,
      totalStudents: studentPreviews.length,
      inserts: studentPreviews.filter(s => s.action === 'insert').length,
      updates: studentPreviews.filter(s => s.action === 'update').length,
      skips: studentPreviews.filter(s => s.action === 'skip').length,
      withGoalsRemoved: studentPreviews.filter(s => s.goalsRemoved && s.goalsRemoved.length > 0).length,
      withSchedule: studentPreviews.filter(s => s.schedule).length,
      withTeacher: studentPreviews.filter(s => s.teacher).length,
      unmatchedCount: unmatchedStudents.length
    });

    perf.end({ success: true });

    // Combine all warnings
    const allWarnings = [
      ...(parseResult.warnings || []),
      ...deliveriesWarnings.map(w => ({ ...w, source: 'deliveries' as const })),
      ...classListWarnings.map(w => ({ ...w, source: 'classList' as const }))
    ];

    // Calculate UPSERT summary counts
    const insertCount = studentPreviews.filter(s => s.action === 'insert').length;
    const updateCount = studentPreviews.filter(s => s.action === 'update').length;
    const skipCount = studentPreviews.filter(s => s.action === 'skip').length;
    const withGoalsRemovedCount = studentPreviews.filter(s => s.goalsRemoved && s.goalsRemoved.length > 0).length;

    // Return preview data
    return NextResponse.json({
      success: true,
      data: {
        students: studentPreviews,
        summary: {
          total: studentPreviews.length,
          // Legacy fields for backward compatibility
          new: studentPreviews.filter(s => s.matchStatus === 'new').length,
          duplicates: studentPreviews.filter(s => s.matchStatus === 'duplicate').length,
          // UPSERT counts
          inserts: insertCount,
          updates: updateCount,
          skips: skipCount,
          // Warning count
          withGoalsRemoved: withGoalsRemovedCount,
          // Enrichment counts
          withSchedule: studentPreviews.filter(s => s.schedule).length,
          withTeacher: studentPreviews.filter(s => s.teacher).length,
          // School filtering info (for multi-school users)
          filteredOutBySchool: filteredOutCount,
          filteredOutSchools: filteredOutSchools.length > 0 ? filteredOutSchools : undefined
        },
        unmatchedStudents: unmatchedStudents.length > 0 ? unmatchedStudents.slice(0, 20) : [],
        parseErrors: parseResult.errors.length > 0 ? parseResult.errors.slice(0, 10) : [],
        parseWarnings: allWarnings.length > 0 ? allWarnings.slice(0, 10) : [],
        scrubErrors: scrubErrors.length > 0 ? scrubErrors.slice(0, 10) : []
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Student import preview error', error instanceof Error ? error : null, { userId });

    track.event('student_import_preview_error', {
      userId,
      error: message
    });

    perf.end({ success: false });

    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
});
