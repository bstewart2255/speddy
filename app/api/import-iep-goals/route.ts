/**
 * IEP Goals Import API
 * Handles Excel file upload, parsing, student matching, and PII scrubbing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { parseSEISReport } from '@/lib/parsers/seis-parser';
import { matchStudents, DatabaseStudent } from '@/lib/utils/student-matcher';
import { scrubPIIFromGoals } from '@/lib/utils/pii-scrubber';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

export const runtime = 'nodejs';

interface ProcessedMatch {
  studentId: string;
  studentInitials: string;
  studentGrade: string;
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  matchReason: string;
  goals: Array<{
    original: string;
    scrubbed: string;
    piiDetected: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
}

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('import_iep_goals', 'api');

  try {
    const supabase = await createClient();

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    log.info('Processing IEP goals import', {
      userId,
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size
    });

    if (!file) {
      log.warn('No file provided in IEP goals import request', { userId });
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      log.warn('Invalid file type for IEP goals import', {
        userId,
        fileType: file.type,
        fileName: file.name
      });

      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Step 1: Parse the Excel file
    log.info('Parsing Excel file', { userId, fileName: file.name });
    const parsePerf = measurePerformanceWithAlerts('parse_excel', 'api');

    let parseResult;
    try {
      parseResult = await parseSEISReport(buffer);
      parsePerf.end({ success: true });

      log.info('Excel parsing complete', {
        userId,
        studentsFound: parseResult.students.length,
        errors: parseResult.errors.length
      });
    } catch (error: any) {
      parsePerf.end({ success: false });
      log.error('Excel parsing failed', error, { userId, fileName: file.name });

      return NextResponse.json(
        {
          error: `Failed to parse Excel file: ${error.message}. Please ensure the file contains student names, grades, and IEP goals.`
        },
        { status: 400 }
      );
    }

    if (parseResult.students.length === 0) {
      log.warn('No students found in Excel file', { userId, fileName: file.name });

      return NextResponse.json(
        {
          error: 'No students with IEP goals found in the file. Please check that the file contains columns for student names, grades, and IEP goals.',
          parseErrors: parseResult.errors
        },
        { status: 400 }
      );
    }

    // Step 2: Get existing students from database
    log.info('Fetching existing students', { userId });
    const dbPerf = measurePerformanceWithAlerts('fetch_students', 'database');

    const { data: dbStudents, error: dbError } = await supabase
      .from('students')
      .select('id, initials, grade_level')
      .eq('provider_id', userId);

    dbPerf.end({ success: !dbError });

    if (dbError) {
      log.error('Failed to fetch students', dbError, { userId });
      return NextResponse.json(
        { error: 'Failed to fetch your students from database' },
        { status: 500 }
      );
    }

    if (!dbStudents || dbStudents.length === 0) {
      log.warn('No students in database for user', { userId });
      return NextResponse.json(
        { error: 'You have no students in your account. Please add students first.' },
        { status: 400 }
      );
    }

    // Get student details for names (if available)
    const { data: studentDetails } = await supabase
      .from('student_details')
      .select('student_id, first_name, last_name')
      .in('student_id', dbStudents.map(s => s.id));

    // Combine students with their details
    const databaseStudents: DatabaseStudent[] = dbStudents.map(student => {
      const details = studentDetails?.find(d => d.student_id === student.id);
      return {
        id: student.id,
        initials: student.initials,
        grade_level: student.grade_level,
        first_name: details?.first_name || undefined,
        last_name: details?.last_name || undefined
      };
    });

    // Step 3: Match parsed students to database students
    log.info('Matching students', {
      userId,
      parsedCount: parseResult.students.length,
      databaseCount: databaseStudents.length
    });

    const matchPerf = measurePerformanceWithAlerts('match_students', 'api');
    const matchResult = matchStudents(parseResult.students, databaseStudents);
    matchPerf.end({ success: true });

    log.info('Student matching complete', {
      userId,
      highConfidence: matchResult.summary.highConfidence,
      mediumConfidence: matchResult.summary.mediumConfidence,
      lowConfidence: matchResult.summary.lowConfidence,
      noMatch: matchResult.summary.noMatch
    });

    // Step 4: Scrub PII from goals for matched students
    const processedMatches: ProcessedMatch[] = [];
    const scrubErrors: string[] = [];

    for (const match of matchResult.matches) {
      if (match.confidence === 'none' || !match.matchedStudent) {
        // Skip students with no match
        continue;
      }

      log.info('Scrubbing PII for student', {
        userId,
        studentId: match.matchedStudent.id,
        goalsCount: match.excelStudent.goals.length
      });

      const scrubPerf = measurePerformanceWithAlerts('scrub_pii', 'api');
      const scrubResult = await scrubPIIFromGoals(
        match.excelStudent.goals,
        match.excelStudent.firstName,
        match.excelStudent.lastName
      );
      scrubPerf.end({ success: scrubResult.errors.length === 0 });

      if (scrubResult.errors.length > 0) {
        scrubErrors.push(...scrubResult.errors);
      }

      processedMatches.push({
        studentId: match.matchedStudent.id,
        studentInitials: match.matchedStudent.initials,
        studentGrade: match.matchedStudent.grade_level,
        matchConfidence: match.confidence,
        matchReason: match.reason,
        goals: scrubResult.goals
      });
    }

    // Track successful import
    track.event('iep_goals_imported', {
      userId,
      studentsMatched: processedMatches.length,
      highConfidenceMatches: matchResult.summary.highConfidence,
      totalGoals: processedMatches.reduce((sum, m) => sum + m.goals.length, 0)
    });

    perf.end({ success: true });

    // Return processed data for preview
    return NextResponse.json({
      success: true,
      data: {
        matches: processedMatches,
        summary: {
          totalParsed: parseResult.students.length,
          matched: processedMatches.length,
          unmatched: matchResult.summary.noMatch,
          highConfidence: matchResult.summary.highConfidence,
          mediumConfidence: matchResult.summary.mediumConfidence,
          lowConfidence: matchResult.summary.lowConfidence
        },
        parseErrors: parseResult.errors,
        scrubErrors,
        unmatchedStudents: matchResult.matches
          .filter(m => m.confidence === 'none')
          .map(m => ({
            firstName: m.excelStudent.firstName,
            lastName: m.excelStudent.lastName,
            initials: m.excelStudent.initials,
            grade: m.excelStudent.gradeLevel,
            reason: m.reason
          }))
      }
    });
  } catch (error: any) {
    log.error('IEP goals import error', error, { userId });

    track.event('iep_goals_import_error', {
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
