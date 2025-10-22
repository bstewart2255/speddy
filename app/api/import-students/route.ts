/**
 * Student Import Preview API
 * Handles bulk student import from SEIS/CSV files
 * Returns preview data for user review before creating students
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { parseSEISReport } from '@/lib/parsers/seis-parser';
import { parseCSVReport } from '@/lib/parsers/csv-parser';
import { matchStudents, DatabaseStudent } from '@/lib/utils/student-matcher';
import { scrubPIIFromGoals } from '@/lib/utils/pii-scrubber';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

export const runtime = 'nodejs';

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
}

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('import_students_preview', 'api');

  try {
    const supabase = await createClient();

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const currentSchoolId = formData.get('currentSchoolId') as string | null;
    const currentSchoolSite = formData.get('currentSchoolSite') as string | null;

    log.info('Processing student import preview', {
      userId,
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
      currentSchoolId,
      currentSchoolSite
    });

    if (!file) {
      log.warn('No file provided in student import request', { userId });
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
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

    // Convert file to buffer
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

    // Parse the file
    // For CSV files with multi-school users, extract unique school sites from existing students
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
      // Use appropriate parser based on file type
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
    } catch (error: any) {
      parsePerf.end({ success: false });
      log.error(`${fileType} parsing failed`, error, { userId, fileName: file.name });

      return NextResponse.json(
        {
          error: `Failed to parse ${fileType} file: ${error.message}. Please ensure the file contains student names, grades, and IEP goals.`
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

    // Process each student: scrub PII from goals and prepare preview data
    const studentPreviews: StudentPreview[] = [];
    const scrubErrors: string[] = [];

    for (const match of matchResult.matches) {
      const student = match.excelStudent;

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

      studentPreviews.push({
        firstName: student.firstName,
        lastName: student.lastName,
        initials: student.initials,
        gradeLevel: student.gradeLevel,
        goals: scrubResult.goals,
        matchStatus: isNew ? 'new' : 'duplicate',
        matchedStudentId: isNew ? undefined : match.matchedStudent?.id,
        matchedStudentInitials: isNew ? undefined : match.matchedStudent?.initials,
        matchConfidence: isNew ? undefined : match.confidence,
        matchReason: isNew ? undefined : match.reason
      });
    }

    // Track preview generation
    track.event('student_import_preview_generated', {
      userId,
      totalStudents: studentPreviews.length,
      newStudents: studentPreviews.filter(s => s.matchStatus === 'new').length,
      duplicates: studentPreviews.filter(s => s.matchStatus === 'duplicate').length
    });

    log.info('Preparing preview response', {
      userId,
      totalStudents: studentPreviews.length,
      newStudents: studentPreviews.filter(s => s.matchStatus === 'new').length,
      duplicates: studentPreviews.filter(s => s.matchStatus === 'duplicate').length
    });

    perf.end({ success: true });

    // Return preview data
    return NextResponse.json({
      success: true,
      data: {
        students: studentPreviews,
        summary: {
          total: studentPreviews.length,
          new: studentPreviews.filter(s => s.matchStatus === 'new').length,
          duplicates: studentPreviews.filter(s => s.matchStatus === 'duplicate').length
        },
        parseErrors: parseResult.errors.length > 0 ? parseResult.errors.slice(0, 10) : [],
        parseWarnings: parseResult.warnings && parseResult.warnings.length > 0 ? parseResult.warnings.slice(0, 10) : [],
        scrubErrors: scrubErrors.length > 0 ? scrubErrors.slice(0, 10) : []
      }
    });
  } catch (error: any) {
    log.error('Student import preview error', error, { userId });

    track.event('student_import_preview_error', {
      userId,
      error: error.message
    });

    perf.end({ success: false });

    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
});
