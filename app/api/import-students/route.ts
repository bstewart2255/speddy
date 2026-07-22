/**
 * Student Import Preview API
 * Handles bulk student import from SEIS/CSV files
 * Supports multi-file upload: Student Goals, Deliveries, Class List (all optional, at least one required)
 * - With Student Goals: Creates/updates students with goals, optionally enriched with deliveries/teacher data
 * - Without Student Goals: Updates existing students with deliveries/teacher data only
 * Returns preview data for user review before creating/updating students
 *
 * This route is a thin orchestrator (SPE-230): it reads the multipart form,
 * dispatches by which files were uploaded, and delegates all parsing, matching,
 * classification, and response shaping to the pipeline modules under
 * `lib/import/` (parse-files, enrich, classify, respond, pipeline).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';
import { readImportForm, exceedsTotalUploadSize, findOversizedFile } from '@/lib/import/parse-files';
import { MAX_FILE_SIZE_MB } from '@/lib/import/detect-import-file';
import { runStudentsPreview, runUpdateOnlyPreview } from '@/lib/import/pipeline';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

export const runtime = 'nodejs';

export const POST = withRoute({}, async ({ req: request, userId }) => {
  const perf = measurePerformanceWithAlerts('import_students_preview', 'api');

  try {
    // Reject an over-ceiling multipart body before formData() buffers it (SPE-260).
    if (exceedsTotalUploadSize(request)) {
      log.warn('Import upload rejected: body exceeds size ceiling', { userId });
      perf.end({ success: false });
      return NextResponse.json(
        { error: `Upload too large. Each file must be under ${MAX_FILE_SIZE_MB} MB.` },
        { status: 413 }
      );
    }

    const supabase = await createClient();
    const form = await readImportForm(request);

    log.info('Processing student import preview', {
      userId,
      studentsFile: form.studentsFile?.name,
      deliveriesFile: form.deliveriesFile?.name,
      classListFile: form.classListFile?.name,
      iepDatesFile: form.iepDatesFile?.name,
      currentSchoolId: form.currentSchoolId,
      currentSchoolSite: form.currentSchoolSite,
    });

    // At least one file is required.
    if (!form.studentsFile && !form.deliveriesFile && !form.classListFile && !form.iepDatesFile) {
      log.warn('No files provided in student import request', { userId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Enforce the per-file cap server-side (the 10 MB UI limit is client-only).
    const oversized = findOversizedFile(form);
    if (oversized) {
      log.warn('Import upload rejected: file exceeds size limit', { userId, fileName: oversized.name });
      perf.end({ success: false });
      return NextResponse.json(
        { error: `"${oversized.name}" exceeds the ${MAX_FILE_SIZE_MB} MB limit.` },
        { status: 413 }
      );
    }

    // No students file → deliveries/class-list "update-only" mode. Otherwise the
    // main path (which itself routes a Speddy roster template to its own builder).
    const ctx = { supabase, userId, form, perf };
    return form.studentsFile
      ? await runStudentsPreview(ctx, form.studentsFile)
      : await runUpdateOnlyPreview(ctx);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Student import preview error', error instanceof Error ? error : null, { userId });

    track.event('student_import_preview_error', {
      userId,
      error: message,
    });

    perf.end({ success: false });

    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
});
