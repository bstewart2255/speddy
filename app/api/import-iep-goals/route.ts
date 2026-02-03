/**
 * IEP Goals Import API
 * Handles Excel file upload, parsing, student matching, and PII scrubbing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { parseSEISReport, ParseResult as SEISParseResult } from '@/lib/parsers/seis-parser';
import { parseCSVReport, ParseResult as CSVParseResult } from '@/lib/parsers/csv-parser';
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
  iepDate?: string; // The IEP date from the parsed report, for validation warnings
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
    const targetStudentId = formData.get('targetStudentId') as string | null;

    log.info('Processing IEP goals import', {
      userId,
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
      targetStudentId: targetStudentId || undefined
    });

    if (!file) {
      log.warn('No file provided in IEP goals import request', { userId });
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
      log.warn('Invalid file type for IEP goals import', {
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

    // Step 1: Get user profile to check if they work at multiple schools and get their role
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('works_at_multiple_schools, role')
      .eq('id', userId)
      .single();

    if (profileError) {
      log.error('Failed to fetch user profile', profileError, { userId });
    }

    // Step 2: Get existing students from database
    log.info('Fetching existing students', { userId });
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

    if (!dbStudents || dbStudents.length === 0) {
      log.warn('No students in database for user', { userId });
      return NextResponse.json(
        { error: 'You have no students in your account. Please add students first.' },
        { status: 400 }
      );
    }

    // Step 3: If targetStudentId provided, fetch target student details and school name
    let targetStudent: {
      initials: string;
      gradeLevel: string;
      schoolName: string;
      firstName?: string;
      lastName?: string;
    } | undefined;

    if (targetStudentId) {
      log.info('Fetching target student details', { userId, targetStudentId });

      // Find target student in dbStudents
      const targetStudentRecord = dbStudents.find(s => s.id === targetStudentId);

      if (!targetStudentRecord) {
        log.error('Target student not found in user\'s students', { userId, targetStudentId });
        return NextResponse.json(
          { error: 'Target student not found in your account.' },
          { status: 404 }
        );
      }

      // Fetch school name from schools table if school_id exists
      let schoolName = targetStudentRecord.school_site || '';

      if (targetStudentRecord.school_id) {
        const { data: schoolData, error: schoolError } = await supabase
          .from('schools')
          .select('name')
          .eq('id', targetStudentRecord.school_id)
          .single();

        if (!schoolError && schoolData) {
          schoolName = schoolData.name;
        } else {
          log.warn('Could not fetch school name, using school_site', {
            userId,
            schoolId: targetStudentRecord.school_id,
            error: schoolError
          });
        }
      }

      // CRITICAL: Warn if target student has no school data
      // This could lead to false matches with students from other schools
      if (!schoolName || schoolName.trim() === '') {
        log.warn('Target student has no school data - import may be unreliable', {
          userId,
          targetStudentId,
          studentInitials: targetStudentRecord.initials
        });
      }

      // Fetch student details for first/last names
      const { data: targetDetails } = await supabase
        .from('student_details')
        .select('first_name, last_name')
        .eq('student_id', targetStudentId)
        .single();

      targetStudent = {
        initials: targetStudentRecord.initials,
        gradeLevel: targetStudentRecord.grade_level,
        schoolName,
        firstName: targetDetails?.first_name || undefined,
        lastName: targetDetails?.last_name || undefined
      };

      log.info('Target student details fetched', {
        userId,
        targetStudentId,
        targetStudent
      });
    }

    // Step 4: Parse the file (CSV or Excel)
    // For CSV files with multi-school users, extract unique school sites from existing students
    let userSchools: string[] | undefined;
    if (isCSV && userProfile?.works_at_multiple_schools && dbStudents) {
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

    let parseResult: SEISParseResult | CSVParseResult;
    try {
      // Use appropriate parser based on file type
      if (isCSV) {
        parseResult = await parseCSVReport(buffer, {
          userSchools,
          targetStudent,
          providerRole: userProfile?.role
        });
      } else {
        parseResult = await parseSEISReport(buffer, {
          providerRole: userProfile?.role
        });
      }

      parsePerf.end({ success: true });

      log.info(`${fileType} parsing complete`, {
        userId,
        studentsFound: parseResult.students.length,
        errors: parseResult.errors.length,
        warnings: 'warnings' in parseResult ? parseResult.warnings?.length || 0 : 0,
        formatDetected: 'formatDetected' in parseResult.metadata ? parseResult.metadata.formatDetected : undefined,
        goalsFiltered: parseResult.metadata.goalsFiltered
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
      log.warn(`No students found in ${fileType} file`, { userId, fileName: file.name, targetStudentId });

      let errorMessage: string;

      if (targetStudent) {
        // Specific error for target student not found
        errorMessage = `Could not find student ${targetStudent.initials} (Grade ${targetStudent.gradeLevel}, ${targetStudent.schoolName}) in the uploaded file. Please verify the student's information matches the CSV file.`;
      } else if ('formatDetected' in parseResult.metadata && parseResult.metadata.formatDetected === 'seis-student-goals') {
        errorMessage = 'No resource/academic students found in the SEIS Student Goals Report. This may be because all goals were filtered out (Speech, OT, Counseling, etc.) or no students matched your school(s).';
      } else {
        errorMessage = 'No students with IEP goals found in the file. Please check that the file contains columns for student names, grades, and IEP goals.';
      }

      return NextResponse.json(
        {
          error: errorMessage,
          parseErrors: parseResult.errors,
          parseWarnings: 'warnings' in parseResult ? parseResult.warnings || [] : [],
          metadata: parseResult.metadata
        },
        { status: 400 }
      );
    }

    // Step 4: Get student details for names (if available)
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

    // Step 5: Match parsed students to database students
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

    // Step 6: Scrub PII from goals for matched students
    const processedMatchesMap = new Map<string, ProcessedMatch>();
    const scrubErrors: string[] = [];

    for (const match of matchResult.matches) {
      if (match.confidence === 'none' || !match.matchedStudent) {
        // Skip students with no match
        continue;
      }

      const studentId = match.matchedStudent.id;

      // Check if we've already processed this student
      if (processedMatchesMap.has(studentId)) {
        // Merge goals with existing entry (avoid duplicates)
        const existing = processedMatchesMap.get(studentId)!;

        log.info('Merging goals for already-processed student', {
          userId,
          studentId,
          existingGoalsCount: existing.goals.length,
          newGoalsCount: match.excelStudent.goals.length
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

        // Add new goals (avoid duplicates)
        for (const newGoal of scrubResult.goals) {
          if (!existing.goals.some(g => g.scrubbed === newGoal.scrubbed)) {
            existing.goals.push(newGoal);
          }
        }
        continue;
      }

      log.info('Scrubbing PII for student', {
        userId,
        studentId,
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

      processedMatchesMap.set(studentId, {
        studentId,
        studentInitials: match.matchedStudent.initials,
        studentGrade: match.matchedStudent.grade_level,
        matchConfidence: match.confidence,
        matchReason: match.reason,
        iepDate: match.excelStudent.iepDate,
        goals: scrubResult.goals
      });
    }

    // Convert map to array
    const processedMatches = Array.from(processedMatchesMap.values());

    // Track successful import
    const totalGoals = processedMatches.reduce((sum, m) => sum + m.goals.length, 0);

    track.event('iep_goals_imported', {
      userId,
      studentsMatched: processedMatches.length,
      highConfidenceMatches: matchResult.summary.highConfidence,
      totalGoals
    });

    log.info('Preparing response', {
      userId,
      matchedStudents: processedMatches.length,
      totalGoals
    });

    // Optimize response: Remove original text to reduce payload size
    // Only send scrubbed goals and metadata
    const optimizedMatches = processedMatches.map(match => ({
      studentId: match.studentId,
      studentInitials: match.studentInitials,
      studentGrade: match.studentGrade,
      matchConfidence: match.matchConfidence,
      matchReason: match.matchReason,
      iepDate: match.iepDate,
      goals: match.goals.map(goal => ({
        // Remove 'original' field to reduce payload size by ~50%
        scrubbed: goal.scrubbed,
        piiDetected: goal.piiDetected,
        confidence: goal.confidence
      }))
    }));

    perf.end({ success: true });

    // Return processed data for preview
    return NextResponse.json({
      success: true,
      data: {
        matches: optimizedMatches,
        summary: {
          totalParsed: parseResult.students.length,
          matched: processedMatches.length,
          unmatched: matchResult.summary.noMatch,
          highConfidence: matchResult.summary.highConfidence,
          mediumConfidence: matchResult.summary.mediumConfidence,
          lowConfidence: matchResult.summary.lowConfidence,
          formatDetected: 'formatDetected' in parseResult.metadata ? parseResult.metadata.formatDetected : undefined,
          goalsFiltered: parseResult.metadata.goalsFiltered
        },
        parseErrors: parseResult.errors.length > 0 ? parseResult.errors.slice(0, 10) : [], // Limit errors
        parseWarnings: 'warnings' in parseResult && parseResult.warnings && parseResult.warnings.length > 0 ? parseResult.warnings.slice(0, 10) : [], // Limit warnings
        scrubErrors: scrubErrors.length > 0 ? scrubErrors.slice(0, 10) : [], // Limit errors
        unmatchedStudents: matchResult.matches
          .filter(m => m.confidence === 'none')
          .slice(0, 20) // Limit unmatched to 20
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
