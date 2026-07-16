/**
 * Per-mode orchestration for the bulk import preview (SPE-230).
 *
 * The route dispatches to one of these based on which files were uploaded; each
 * does the Supabase I/O and telemetry and delegates the logic to
 * parse-files / enrich / classify / respond. The deliveries/class-list
 * "update-only" mode is no longer a parallel reimplementation — it shares the
 * same parse/enrich/respond building blocks and differs only in that its
 * preview rows fall out of classifying existing students (the students file is
 * absent).
 */
import { NextResponse } from 'next/server';
import { ParseResult as CSVParseResult } from '@/lib/parsers/csv-parser';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { BulkPreviewData } from '@/lib/types/student-import';
import type { ImportForm } from '@/lib/import/parse-files';
import {
  classifyStudentsFileType,
  parseStudentsFile,
  parseDeliveriesFile,
  parseClassListFile,
  applySchoolFilter,
} from '@/lib/import/parse-files';
import {
  loadProfile,
  loadExistingStudents,
  loadStudentDetails,
  loadJoinedStudents,
  fetchTeachers,
} from '@/lib/import/enrich';
import {
  buildStudentPreviews,
  buildUpdatePreviews,
  buildStudentsByName,
  buildRosterPreviews,
  toDatabaseStudents,
} from '@/lib/import/classify';
import {
  buildMainPreviewData,
  buildUpdatePreviewData,
  buildRosterPreviewData,
  collectUnmatched,
  summarizePreviews,
} from '@/lib/import/respond';
import type { ImportSupabaseClient } from '@/lib/import/preview-types';

type Perf = ReturnType<typeof measurePerformanceWithAlerts>;
type Note = { row: number; message: string };

interface PipelineContext {
  supabase: ImportSupabaseClient;
  userId: string;
  form: ImportForm;
  perf: Perf;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

/**
 * Deliveries/class-list "update-only" mode: no students file, so preview rows
 * are updates that fall out of matching existing students against the
 * enrichment files.
 */
export async function runUpdateOnlyPreview(ctx: PipelineContext): Promise<NextResponse> {
  const { supabase, userId, form, perf } = ctx;
  const { deliveriesFile, classListFile, currentSchoolId } = form;

  log.info('Processing deliveries/classList only mode', {
    userId,
    hasDeliveries: !!deliveriesFile,
    hasClassList: !!classListFile,
  });

  const profile = await loadProfile(supabase, userId);
  const providerRole = profile?.role || 'resource';

  const { data: dbStudents, error: dbError } = await loadJoinedStudents(supabase, userId);
  if (dbError) {
    log.error('Failed to fetch students', dbError instanceof Error ? dbError : null, { userId });
    perf.end({ success: false });
    return NextResponse.json({ error: 'Failed to fetch your students from database' }, { status: 500 });
  }
  if (!dbStudents || dbStudents.length === 0) {
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'No existing students found. Please upload a Student Goals file first to create students.' },
      { status: 400 },
    );
  }

  const studentsByName = buildStudentsByName(dbStudents);

  // Parse enrichment files. Update-only hard-fails on a parse error (there is no
  // other data to preview).
  let deliveries: Awaited<ReturnType<typeof parseDeliveriesFile>> | null = null;
  if (deliveriesFile) {
    try {
      deliveries = await parseDeliveriesFile(deliveriesFile, { providerRole });
    } catch (error) {
      log.error('Failed to parse deliveries file', error instanceof Error ? error : null, { userId });
      perf.end({ success: false });
      return NextResponse.json({ error: `Failed to parse deliveries file: ${errorMessage(error)}` }, { status: 400 });
    }
  }
  let classList: Awaited<ReturnType<typeof parseClassListFile>> | null = null;
  if (classListFile) {
    try {
      classList = await parseClassListFile(classListFile);
    } catch (error) {
      log.error('Failed to parse class list file', error instanceof Error ? error : null, { userId });
      perf.end({ success: false });
      return NextResponse.json({ error: `Failed to parse class list file: ${errorMessage(error)}` }, { status: 400 });
    }
  }

  const dbTeachers = classList && classList.students.size > 0 ? await fetchTeachers(supabase, currentSchoolId) : [];

  const { studentUpdates, matchedDeliveryNames, matchedClassListNames, unmatchedStudents } = buildUpdatePreviews({
    studentsByName,
    deliveriesData: deliveries?.deliveries ?? null,
    classListData: classList?.students ?? null,
    dbTeachers,
  });

  track.event('student_update_preview_generated', {
    userId,
    totalUpdates: studentUpdates.length,
    withSchedule: studentUpdates.filter(s => s.schedule).length,
    withTeacher: studentUpdates.filter(s => s.teacher).length,
    unmatchedCount: unmatchedStudents.length,
    hasDeliveriesFile: !!deliveriesFile,
    hasClassListFile: !!classListFile,
  });

  perf.end({ success: true });

  const data: BulkPreviewData = buildUpdatePreviewData({
    studentUpdates,
    unmatchedStudents,
    deliveries: deliveriesFile && deliveries
      ? { fileName: deliveriesFile.name, read: deliveries.read, matched: matchedDeliveryNames.size, warnings: deliveries.warnings }
      : null,
    classList: classListFile && classList
      ? { fileName: classListFile.name, read: classList.read, matched: matchedClassListNames.size, warnings: classList.warnings }
      : null,
  });

  return NextResponse.json({ success: true, mode: 'update', data });
}

/**
 * Main path: a students file is present. Parses it, routes a Speddy roster
 * template to its own builder, otherwise matches + classifies against existing
 * students with optional deliveries/class-list enrichment.
 */
export async function runStudentsPreview(ctx: PipelineContext, file: File): Promise<NextResponse> {
  const { supabase, userId, form, perf } = ctx;
  const { deliveriesFile, classListFile, currentSchoolId, currentSchoolSite } = form;

  const { isExcel, isCSV } = classifyStudentsFileType(file);
  if (!isExcel && !isCSV) {
    return NextResponse.json(
      { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls) or CSV file (.csv)' },
      { status: 400 },
    );
  }

  const profile = await loadProfile(supabase, userId);

  const { data: dbStudents, error: dbError } = await loadExistingStudents(supabase, userId);
  if (dbError) {
    log.error('Failed to fetch students', dbError instanceof Error ? dbError : null, { userId });
    return NextResponse.json({ error: 'Failed to fetch your students from database' }, { status: 500 });
  }

  // Multi-school CSV users: derive their school sites so the parser can annotate
  // school-of-attendance.
  let userSchools: string[] | undefined;
  if (isCSV && profile?.works_at_multiple_schools && dbStudents && dbStudents.length > 0) {
    userSchools = Array.from(
      new Set(
        dbStudents
          .map(s => s.school_site)
          .filter((site): site is string => site !== null && site !== undefined && site.trim() !== ''),
      ),
    );
  }

  const fileType = isCSV ? 'CSV' : 'Excel';
  let parseResult;
  try {
    parseResult = await parseStudentsFile(file, { isCSV, userSchools, providerRole: profile?.role ?? undefined });
  } catch (error) {
    log.error(`${fileType} parsing failed`, error instanceof Error ? error : null, { userId, fileName: file.name });
    return NextResponse.json(
      { error: `Failed to parse ${fileType} file: ${errorMessage(error)}. Please ensure the file contains student names, grades, and IEP goals.` },
      { status: 400 },
    );
  }

  // SPE-225: a Speddy roster template creates students by initials+grade with an
  // inline teacher/schedule and no goals — route it to its own preview builder.
  if (isCSV && (parseResult as CSVParseResult).metadata.formatDetected === 'speddy-template') {
    return await runRosterTemplatePreview(ctx, file, parseResult as CSVParseResult, dbStudents);
  }

  if (parseResult.students.length === 0) {
    // Surface the CSV row-0 detection reason (roster-template hint / name+goal
    // column message) as the top-level error; SEIS per-sheet/per-row errors are
    // excluded on purpose.
    const detectionError = isCSV ? parseResult.errors.find(e => e.row === 0)?.message : undefined;
    return NextResponse.json(
      {
        error:
          detectionError ||
          'No students with IEP goals found in the file. Please check that the file contains columns for student names, grades, and IEP goals.',
        parseErrors: parseResult.errors,
        parseWarnings: 'warnings' in parseResult ? parseResult.warnings || [] : [],
      },
      { status: 400 },
    );
  }

  // Scope to the current school for multi-school providers. Keep the filtered
  // list local rather than reassigning parseResult.students (a parser-specific
  // union type); it feeds both matching and the receipt count below.
  const filter = applySchoolFilter(parseResult.students, currentSchoolSite, profile?.works_at_multiple_schools);
  const filteredStudents = filter.students;
  if (filteredStudents.length === 0 && filter.filteredOutCount > 0) {
    return NextResponse.json(
      {
        error: `All ${filter.filteredOutCount} students in this file belong to other schools (${filter.filteredOutSchools.join(', ')}). Please switch to the correct school or upload a file with students from ${currentSchoolSite}.`,
        filteredOutSchools: filter.filteredOutSchools,
      },
      { status: 400 },
    );
  }

  // Parse optional enrichment files. Main path soft-fails: a parse error becomes
  // a warning, not a 4xx.
  let deliveries: Awaited<ReturnType<typeof parseDeliveriesFile>> | null = null;
  const deliveriesWarnings: Note[] = [];
  if (deliveriesFile) {
    try {
      deliveries = await parseDeliveriesFile(deliveriesFile, { providerRole: profile?.role ?? undefined });
      deliveriesWarnings.push(...deliveries.warnings);
    } catch (error) {
      log.error('Failed to parse deliveries file', error instanceof Error ? error : null, { userId });
      deliveriesWarnings.push({ row: 0, message: `Failed to parse deliveries file: ${errorMessage(error)}` });
    }
  }
  let classList: Awaited<ReturnType<typeof parseClassListFile>> | null = null;
  const classListWarnings: Note[] = [];
  if (classListFile) {
    try {
      classList = await parseClassListFile(classListFile);
      classListWarnings.push(...classList.warnings);
    } catch (error) {
      log.error('Failed to parse class list file', error instanceof Error ? error : null, { userId });
      classListWarnings.push({ row: 0, message: `Failed to parse class list file: ${errorMessage(error)}` });
    }
  }

  const dbTeachers = classList && classList.students.size > 0 ? await fetchTeachers(supabase, currentSchoolId) : [];
  const studentDetails = await loadStudentDetails(supabase, dbStudents);
  const databaseStudents = toDatabaseStudents(dbStudents, studentDetails);

  const { studentPreviews, matchedDeliveryNames, matchedClassListNames } = buildStudentPreviews({
    parsedStudents: filteredStudents,
    databaseStudents,
    deliveriesData: deliveries?.deliveries ?? null,
    classListData: classList?.students ?? null,
    dbTeachers,
  });

  const unmatchedStudents = collectUnmatched(
    deliveries?.deliveries ?? null,
    classList?.students ?? null,
    matchedDeliveryNames,
    matchedClassListNames,
  );

  const counts = summarizePreviews(studentPreviews);
  track.event('student_import_preview_generated', {
    userId,
    totalStudents: studentPreviews.length,
    inserts: counts.inserts,
    updates: counts.updates,
    skips: counts.skips,
    withGoalsRemoved: counts.withGoalsRemoved,
    withSchedule: counts.withSchedule,
    withTeacher: counts.withTeacher,
    hasDeliveriesFile: !!deliveriesFile,
    hasClassListFile: !!classListFile,
  });

  perf.end({ success: true });

  const data: BulkPreviewData = buildMainPreviewData({
    studentPreviews,
    studentsFileName: file.name,
    parsedStudentCount: filteredStudents.length,
    parseWarnings: 'warnings' in parseResult ? parseResult.warnings || [] : [],
    parseErrors: parseResult.errors,
    filteredOutCount: filter.filteredOutCount,
    filteredOutSchools: filter.filteredOutSchools,
    deliveries: deliveriesFile
      ? { fileName: deliveriesFile.name, read: deliveries?.read ?? 0, matched: matchedDeliveryNames.size, warnings: deliveriesWarnings }
      : null,
    classList: classListFile
      ? { fileName: classListFile.name, read: classList?.read ?? 0, matched: matchedClassListNames.size, warnings: classListWarnings }
      : null,
    unmatchedStudents,
  });

  return NextResponse.json({ success: true, data });
}

/** Speddy roster-template mode (initials + grade + inline teacher/schedule). */
async function runRosterTemplatePreview(
  ctx: PipelineContext,
  file: File,
  parseResult: CSVParseResult,
  dbStudents: Awaited<ReturnType<typeof loadExistingStudents>>['data'],
): Promise<NextResponse> {
  const { supabase, userId, form, perf } = ctx;
  const dbTeachers = await fetchTeachers(supabase, form.currentSchoolId);

  const studentPreviews = buildRosterPreviews({
    students: parseResult.students,
    dbStudents: dbStudents || [],
    currentSchoolId: form.currentSchoolId,
    dbTeachers,
  });

  const insertCount = studentPreviews.filter(s => s.action === 'insert').length;
  const updateCount = studentPreviews.filter(s => s.action === 'update').length;
  const skipCount = studentPreviews.filter(s => s.action === 'skip').length;

  track.event('student_import_preview_generated', {
    userId,
    totalStudents: studentPreviews.length,
    inserts: insertCount,
    updates: updateCount,
    skips: skipCount,
    withGoalsRemoved: 0,
    withSchedule: studentPreviews.filter(s => s.schedule).length,
    withTeacher: studentPreviews.filter(s => s.teacher?.teacherId).length,
    hasDeliveriesFile: false,
    hasClassListFile: false,
  });

  perf.end({ success: true });

  const data: BulkPreviewData = buildRosterPreviewData({
    studentPreviews,
    studentsFileName: file.name,
    parsedStudentCount: parseResult.students.length,
    parseWarnings: parseResult.warnings || [],
  });

  return NextResponse.json({ success: true, data });
}
