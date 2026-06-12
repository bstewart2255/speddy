import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withRoute } from '@/lib/api/with-route';
import { isAdminForSchool } from '@/lib/api/admin-authz';

const log = logger.child({ module: 'admin-student-delete' });

const querySchema = z.object({ schoolId: z.string().uuid() });

/**
 * DELETE /api/admin/students/[studentId]?schoolId=<uuid>
 *
 * SPE-143: admin "delete student". The row delete runs under the admin's own RLS
 * session (preserving the database authorization backstop); the cascade removes
 * every FK-linked child (details, assessments, exit tickets, progress, schedule,
 * worksheet rows, etc.). The service-role client is used ONLY to reach what RLS +
 * cascade cannot:
 *   1. Storage objects — Postgres cascade deletes rows, never Storage objects, and
 *      the admin is not the object owner. Worksheet images live in the private
 *      `worksheet-submissions` (path in worksheet_submissions.image_url) and
 *      `worksheets` (worksheets.uploaded_file_path) buckets.
 *   2. CARE referrals — linked to the student by free-text name, not a foreign key,
 *      so they never cascade. We surface name matches for the admin to confirm
 *      (handled by /api/admin/care-referrals/[referralId]); we never auto-delete
 *      them, since a name match can be ambiguous.
 */
export const DELETE = withRoute<{ studentId: string }, undefined, { schoolId: string }>(
  { query: querySchema },
  async ({ userId, params, query }) => {
    const { studentId } = params;
    const { schoolId } = query;

    const rls = await createClient();
    if (!(await isAdminForSchool(rls, userId, schoolId))) {
      return NextResponse.json(
        { error: 'You do not have permission to delete students at this school' },
        { status: 403 }
      );
    }

    const service = createServiceClient();

    // Verify the student exists and belongs to this school (service role is authoritative).
    const { data: student, error: studentErr } = await service
      .from('students')
      .select('id, school_id')
      .eq('id', studentId)
      .single();

    if (studentErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    if (student.school_id !== schoolId) {
      return NextResponse.json({ error: 'Student does not belong to this school' }, { status: 403 });
    }

    // --- Collect everything that does NOT cascade, BEFORE deleting the rows ---

    // (1) Storage object paths for this student's worksheets + submissions.
    const { data: worksheets } = await service
      .from('worksheets')
      .select('id, uploaded_file_path')
      .eq('student_id', studentId);

    const worksheetIds = (worksheets ?? []).map((w) => w.id);
    const worksheetPaths = (worksheets ?? [])
      .map((w) => w.uploaded_file_path)
      .filter((p): p is string => !!p);

    let submissionPaths: string[] = [];
    if (worksheetIds.length) {
      const { data: subs } = await service
        .from('worksheet_submissions')
        .select('image_url')
        .in('worksheet_id', worksheetIds);
      submissionPaths = (subs ?? [])
        .map((s) => s.image_url)
        .filter((p): p is string => !!p);
    }

    // (2) CARE referrals matched by the student's full name within this school.
    const { data: details } = await service
      .from('student_details')
      .select('first_name, last_name')
      .eq('student_id', studentId)
      .maybeSingle();

    let careMatches: Array<{ id: string; student_name: string; referral_reason: string | null }> = [];
    const fullName = `${details?.first_name ?? ''} ${details?.last_name ?? ''}`.trim();
    if (fullName) {
      const { data: refs } = await service
        .from('care_referrals')
        .select('id, student_name, referral_reason')
        .eq('school_id', schoolId)
        .ilike('student_name', fullName);
      careMatches = refs ?? [];
    }

    // --- Delete the student under RLS (keeps the database authorization backstop) ---
    // schedule_sessions would cascade from students; delete explicitly to match the
    // prior behavior and to fail loudly here if the admin lacks permission.
    const { error: sessErr } = await rls
      .from('schedule_sessions')
      .delete()
      .eq('student_id', studentId);
    if (sessErr) {
      log.error('Failed to delete student schedule sessions', sessErr);
      return NextResponse.json({ error: 'Failed to delete student sessions' }, { status: 500 });
    }

    const { error: delErr } = await rls.from('students').delete().eq('id', studentId);
    if (delErr) {
      log.error('Failed to delete student', delErr);
      return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 });
    }

    // --- Remove Storage objects (service role; admin is not the object owner) ---
    let storageErrors = 0;
    if (submissionPaths.length) {
      const { error } = await service.storage.from('worksheet-submissions').remove(submissionPaths);
      if (error) {
        storageErrors++;
        log.error('Failed to remove worksheet-submission images', error);
      }
    }
    if (worksheetPaths.length) {
      const { error } = await service.storage.from('worksheets').remove(worksheetPaths);
      if (error) {
        storageErrors++;
        log.error('Failed to remove worksheet images', error);
      }
    }

    log.info('Student deleted by admin', {
      studentId,
      deletedBy: userId,
      storageObjectsRemoved: submissionPaths.length + worksheetPaths.length,
      careMatches: careMatches.length,
    });

    return NextResponse.json({
      success: true,
      careMatches,
      storageObjectsRemoved: submissionPaths.length + worksheetPaths.length,
      storageErrors: storageErrors || undefined,
    });
  }
);
