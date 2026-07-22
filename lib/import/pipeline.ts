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
  parseIepDatesFile,
  applySchoolFilter,
} from '@/lib/import/parse-files';
import type { IepDatesRecord } from '@/lib/parsers/iep-dates-parser';
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
import { createNormalizedKey } from '@/lib/parsers/name-utils';

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
 * Scope IEP Dates records to the current school before matching (SPE-303).
 * The report can include other-school / other-case-manager students; dropping
 * the other-school rows up front (via applySchoolFilter, the same helper the
 * goals file uses) keeps them out of the "needs review" unmatched list — mirroring
 * the SPE-268 suppression. Records with a blank School of Attendance are kept.
 * Re-keys the kept records by normalized name for the enrichment lookup.
 */
function scopeIepDatesToSchool(
  records: Map<string, IepDatesRecord>,
  currentSchoolSite: string | null,
  worksAtMultipleSchools: boolean | null | undefined,
): Map<string, IepDatesRecord> {
  const { students } = applySchoolFilter(Array.from(records.values()), currentSchoolSite, worksAtMultipleSchools);
  return new Map(students.map((r) => [r.normalizedName, r]));
}

/**
 * Deliveries/class-list "update-only" mode: no students file, so preview rows
 * are updates that fall out of matching existing students against the
 * enrichment files.
 */
export async function runUpdateOnlyPreview(ctx: PipelineContext): Promise<NextResponse> {
  const { supabase, userId, form, perf } = ctx;
  const { deliveriesFile, classListFile, iepDatesFile, currentSchoolId, currentSchoolSite } = form;

  log.info('Processing deliveries/classList/iepDates only mode', {
    userId,
    hasDeliveries: !!deliveriesFile,
    hasClassList: !!classListFile,
    hasIepDates: !!iepDatesFile,
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

  // Scope to the selected school (SPE-269) before name-keying. buildStudentsByName
  // keys by normalized full name and overwrites collisions, so for a multi-school
  // provider an unscoped map could match — and update — a same-name student at a
  // different school. Null school_id / empty currentSchoolId collapse to one bucket,
  // consistent with the main path and the confirm dedup key.
  const dbStudentsInSchool = dbStudents.filter(
    s => (s.school_id ?? '') === (currentSchoolId ?? ''),
  );
  const studentsByName = buildStudentsByName(dbStudentsInSchool);

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
  let iepDates: Awaited<ReturnType<typeof parseIepDatesFile>> | null = null;
  let iepDatesInScope: Map<string, IepDatesRecord> | null = null;
  if (iepDatesFile) {
    try {
      iepDates = await parseIepDatesFile(iepDatesFile);
      iepDatesInScope = scopeIepDatesToSchool(iepDates.records, currentSchoolSite, profile?.works_at_multiple_schools);
    } catch (error) {
      log.error('Failed to parse IEP dates file', error instanceof Error ? error : null, { userId });
      perf.end({ success: false });
      return NextResponse.json({ error: `Failed to parse IEP dates file: ${errorMessage(error)}` }, { status: 400 });
    }
  }

  const dbTeachers = classList && classList.students.size > 0 ? await fetchTeachers(supabase, currentSchoolId) : [];

  const { studentUpdates, matchedDeliveryNames, matchedClassListNames, matchedIepDatesNames, unmatchedStudents } =
    buildUpdatePreviews({
      studentsByName,
      deliveriesData: deliveries?.deliveries ?? null,
      classListData: classList?.students ?? null,
      iepDatesData: iepDatesInScope,
      dbTeachers,
    });

  track.event('student_update_preview_generated', {
    userId,
    totalUpdates: studentUpdates.filter(s => s.action === 'update').length,
    withSchedule: studentUpdates.filter(s => s.schedule).length,
    withTeacher: studentUpdates.filter(s => s.teacher).length,
    // Count only rows that actually apply a date change (an unchanged-date match
    // is an action:'skip' row that still carries iepDates) so this stays
    // consistent with totalUpdates.
    withIepDates: studentUpdates.filter(s => s.action === 'update' && s.iepDates).length,
    unmatchedCount: unmatchedStudents.length,
    hasDeliveriesFile: !!deliveriesFile,
    hasClassListFile: !!classListFile,
    hasIepDatesFile: !!iepDatesFile,
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
    iepDates: iepDatesFile && iepDates
      ? { fileName: iepDatesFile.name, read: iepDates.read, matched: matchedIepDatesNames.size, warnings: iepDates.warnings }
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
  const { deliveriesFile, classListFile, iepDatesFile, currentSchoolId, currentSchoolSite } = form;

  const { isExcel, isCSV } = classifyStudentsFileType(file);
  if (!isExcel && !isCSV) {
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls) or CSV file (.csv)' },
      { status: 400 },
    );
  }

  const profile = await loadProfile(supabase, userId);

  const dbPerf = measurePerformanceWithAlerts('fetch_students', 'database');
  const { data: dbStudents, error: dbError } = await loadExistingStudents(supabase, userId);
  dbPerf.end({ success: !dbError });
  if (dbError) {
    log.error('Failed to fetch students', dbError instanceof Error ? dbError : null, { userId });
    perf.end({ success: false });
    return NextResponse.json({ error: 'Failed to fetch your students from database' }, { status: 500 });
  }

  // Parse the whole file — do NOT pre-filter students by school here. Scoping to
  // the provider's current school happens once, downstream, in applySchoolFilter
  // (which keys off the selected school). A previous parse-time filter keyed off
  // the schools where the provider ALREADY had students; when importing into a
  // school with no students yet (the first-import case), it dropped every student
  // in the file, producing a false "all belong to other schools" error. Keep
  // school scoping in exactly one place (SPE-264).
  const fileType = isCSV ? 'CSV' : 'Excel';
  const parsePerf = measurePerformanceWithAlerts(`parse_${fileType.toLowerCase()}`, 'api');
  let parseResult;
  try {
    parseResult = await parseStudentsFile(file, { isCSV, providerRole: profile?.role ?? undefined });
    parsePerf.end({ success: true });
  } catch (error) {
    parsePerf.end({ success: false });
    log.error(`${fileType} parsing failed`, error instanceof Error ? error : null, { userId, fileName: file.name });
    perf.end({ success: false });
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
    perf.end({ success: false });
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
    perf.end({ success: false });
    return NextResponse.json(
      {
        error: `None of the students in this file are at ${currentSchoolSite} — they're at ${filter.filteredOutSchools.join(', ')}. Switch to the matching school in the top-bar selector, or upload a file that includes ${currentSchoolSite} students.`,
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
  let iepDates: Awaited<ReturnType<typeof parseIepDatesFile>> | null = null;
  let iepDatesInScope: Map<string, IepDatesRecord> | null = null;
  const iepDatesWarnings: Note[] = [];
  if (iepDatesFile) {
    try {
      iepDates = await parseIepDatesFile(iepDatesFile);
      iepDatesWarnings.push(...iepDates.warnings);
      iepDatesInScope = scopeIepDatesToSchool(iepDates.records, currentSchoolSite, profile?.works_at_multiple_schools);
    } catch (error) {
      log.error('Failed to parse IEP dates file', error instanceof Error ? error : null, { userId });
      iepDatesWarnings.push({ row: 0, message: `Failed to parse IEP dates file: ${errorMessage(error)}` });
    }
  }

  const dbTeachers = classList && classList.students.size > 0 ? await fetchTeachers(supabase, currentSchoolId) : [];

  // Scope match candidates to the selected school (SPE-269), mirroring the roster
  // path (buildRosterPreviews). Identity is name+grade (SPE-266), but a same-name
  // student can exist at two schools, so a Mt-Diablo import must not match — and
  // on confirm update — a same-name student at another school. Same-school only.
  // A null school_id and an empty currentSchoolId ('' — what the modal submits for
  // a school with no school_id) collapse to one bucket, matching the confirm dedup
  // key (buildSchoolScopedDedupKey) and the DB index's NULLS NOT DISTINCT.
  const dbStudentsInSchool = (dbStudents ?? []).filter(
    s => (s.school_id ?? '') === (currentSchoolId ?? ''),
  );
  const { data: studentDetails, error: detailsError } = await loadStudentDetails(supabase, dbStudentsInSchool);
  if (detailsError) {
    // Fail safe (SPE-284): if the details query failed, every student looks
    // nameless. Log it and disable initials-enrichment below so an unloaded real
    // name can't be overwritten — unmatched rows just fall through as inserts,
    // the pre-existing degraded behavior.
    log.error(
      'Failed to load student details for import matching',
      detailsError instanceof Error ? detailsError : null,
      { userId },
    );
  }
  const databaseStudents = toDatabaseStudents(dbStudentsInSchool, studentDetails);

  const { studentPreviews, matchedDeliveryNames, matchedClassListNames, matchedIepDatesNames } = buildStudentPreviews({
    parsedStudents: filteredStudents,
    databaseStudents,
    deliveriesData: deliveries?.deliveries ?? null,
    classListData: classList?.students ?? null,
    iepDatesData: iepDatesInScope,
    dbTeachers,
    // Only enrich no-name rows by initials+grade when details actually loaded
    // (otherwise a merely-unloaded name would look blank and could be overwritten).
    enrichNoNameByInitials: !detailsError,
  });

  // A Deliveries/Class List row for a student the goals report placed at another
  // school was correctly set aside by school (the top banner already reports it),
  // not genuinely missing — suppress it from the review queue rather than flag it
  // as "needs review / add via roster" (SPE-268). Keyed the same way the deliveries
  // map is (createNormalizedKey), so the names line up.
  const filteredOutNames = new Set(
    filter.filteredOutStudents.map(s => createNormalizedKey(s.firstName, s.lastName)),
  );

  const unmatchedStudents = collectUnmatched(
    deliveries?.deliveries ?? null,
    classList?.students ?? null,
    matchedDeliveryNames,
    matchedClassListNames,
    filteredOutNames,
    iepDatesInScope,
    matchedIepDatesNames,
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
    hasIepDatesFile: !!iepDatesFile,
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
    iepDates: iepDatesFile
      ? { fileName: iepDatesFile.name, read: iepDates?.read ?? 0, matched: matchedIepDatesNames.size, warnings: iepDatesWarnings }
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
