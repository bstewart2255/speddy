/**
 * Student Import Preview API
 * Handles bulk student import from SEIS/CSV files
 * Supports multi-file upload: Student Goals (required), Deliveries (optional), Class List (optional)
 * Returns preview data for user review before creating students
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
  matchStatus: 'new' | 'duplicate';
  matchedStudentId?: string; // If duplicate, the ID of existing student
  matchedStudentInitials?: string; // If duplicate, the initials of existing student
  matchConfidence?: 'high' | 'medium' | 'low'; // If duplicate, confidence level
  matchReason?: string; // If duplicate, reason for match
  // New fields from Deliveries file
  schedule?: ScheduleData;
  // New fields from Class List file
  teacher?: TeacherMatch;
}

interface UnmatchedStudent {
  name: string;
  source: 'deliveries' | 'classList';
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

    if (!file) {
      log.warn('No students file provided in student import request', { userId });
      return NextResponse.json({ error: 'No students file provided' }, { status: 400 });
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

    // Get user profile to check if they work at multiple schools
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('works_at_multiple_schools')
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
      .select('id, initials, grade_level, school_site, school_id')
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
        parseResult = await parseCSVReport(buffer, { userSchools });
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

    // Parse optional Deliveries file
    let deliveriesData: Map<string, DeliveryRecord> | null = null;
    const deliveriesWarnings: Array<{ row: number; message: string }> = [];
    if (deliveriesFile) {
      try {
        const deliveriesBytes = await deliveriesFile.arrayBuffer();
        const deliveriesBuffer = Buffer.from(deliveriesBytes);
        const deliveriesResult = await parseDeliveriesCSV(deliveriesBuffer);
        deliveriesData = deliveriesResult.deliveries;
        deliveriesWarnings.push(...deliveriesResult.warnings);

        log.info('Deliveries file parsed', {
          userId,
          totalStudents: deliveriesResult.metadata.uniqueStudents,
          filtered330Rows: deliveriesResult.metadata.filtered330Rows
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

    // Get student details for names (if available) for duplicate detection
    const { data: studentDetails } = dbStudents && dbStudents.length > 0 ? await supabase
      .from('student_details')
      .select('student_id, first_name, last_name')
      .in('student_id', dbStudents.map(s => s.id)) : { data: null };

    // Combine students with their details for matching
    const databaseStudents: DatabaseStudent[] = dbStudents?.map(student => {
      const details = studentDetails?.find(d => d.student_id === student.id);
      return {
        id: student.id,
        initials: student.initials,
        grade_level: student.grade_level,
        first_name: details?.first_name || undefined,
        last_name: details?.last_name || undefined
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

      // Determine match status
      const isNew = match.confidence === 'none';

      // Build preview object
      const preview: StudentPreview = {
        firstName: student.firstName,
        lastName: student.lastName,
        initials: student.initials,
        gradeLevel: student.gradeLevel,
        goals: scrubResult.goals,
        matchStatus: isNew ? 'new' : 'duplicate',
        matchedStudentId: isNew ? undefined : match.matchedStudent?.id,
        matchedStudentInitials: isNew ? undefined : match.matchedStudent?.initials,
        matchConfidence: isNew ? undefined : (match.confidence === 'none' ? undefined : match.confidence as 'high' | 'medium' | 'low'),
        matchReason: isNew ? undefined : match.reason
      };

      // Match with deliveries data
      if (deliveriesData) {
        const deliveryRecord = deliveriesData.get(normalizedKey);
        if (deliveryRecord) {
          matchedDeliveryNames.add(normalizedKey);
          preview.schedule = {
            sessionsPerWeek: deliveryRecord.sessionsPerWeek,
            minutesPerSession: deliveryRecord.minutesPerSession,
            weeklyMinutes: deliveryRecord.weeklyMinutes,
            frequency: deliveryRecord.sessionsFrequency
          };
        }
      }

      // Match with class list data
      if (classListData) {
        const classListStudent = classListData.get(normalizedKey);
        if (classListStudent) {
          matchedClassListNames.add(normalizedKey);

          // Try to match teacher to database
          const teacherMatch = matchTeacher(classListStudent.teacher, dbTeachers);

          // Find teacher name for display
          let teacherName: string | null = null;
          if (teacherMatch.teacherId) {
            const dbTeacher = dbTeachers.find(t => t.id === teacherMatch.teacherId);
            if (dbTeacher) {
              teacherName = [dbTeacher.first_name, dbTeacher.last_name].filter(Boolean).join(' ');
            }
          }

          preview.teacher = {
            teacherId: teacherMatch.teacherId,
            teacherName: teacherName || classListStudent.teacher.rawName,
            confidence: teacherMatch.confidence,
            reason: teacherMatch.reason
          };
        }
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

    // Track preview generation
    track.event('student_import_preview_generated', {
      userId,
      totalStudents: studentPreviews.length,
      newStudents: studentPreviews.filter(s => s.matchStatus === 'new').length,
      duplicates: studentPreviews.filter(s => s.matchStatus === 'duplicate').length,
      withSchedule: studentPreviews.filter(s => s.schedule).length,
      withTeacher: studentPreviews.filter(s => s.teacher).length,
      hasDeliveriesFile: !!deliveriesFile,
      hasClassListFile: !!classListFile
    });

    log.info('Preparing preview response', {
      userId,
      totalStudents: studentPreviews.length,
      newStudents: studentPreviews.filter(s => s.matchStatus === 'new').length,
      duplicates: studentPreviews.filter(s => s.matchStatus === 'duplicate').length,
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

    // Return preview data
    return NextResponse.json({
      success: true,
      data: {
        students: studentPreviews,
        summary: {
          total: studentPreviews.length,
          new: studentPreviews.filter(s => s.matchStatus === 'new').length,
          duplicates: studentPreviews.filter(s => s.matchStatus === 'duplicate').length,
          withSchedule: studentPreviews.filter(s => s.schedule).length,
          withTeacher: studentPreviews.filter(s => s.teacher).length
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
