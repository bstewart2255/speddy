import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withRoute } from '@/lib/api/with-route';

const lessonDateQuerySchema = z.object({
  lesson_date: z.string().optional(),
});

/**
 * Snapshot the group's current members onto the lesson at write time, mirroring
 * the pattern AI lessons already use (student_ids[] + student_details jsonb).
 * Membership is the set of distinct students carrying this group_id on their
 * template rows (session_date IS NULL). Capturing it at save time keeps a group
 * lesson legible even after the group is later reshuffled or dissolved.
 */
async function buildGroupMemberSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string
): Promise<{ studentIds: string[]; studentDetails: Array<{ id: string; initials: string | null; grade_level: string | null }> }> {
  const { data: memberRows, error } = await supabase
    .from('schedule_sessions')
    .select('student_id, students(id, initials, grade_level)')
    .eq('group_id', groupId)
    .is('session_date', null)
    .is('deleted_at', null);

  if (error) {
    // Non-fatal: a save should not fail because the snapshot lookup hiccuped.
    // Log and fall back to empty arrays so the lesson still persists.
    log.warn('Failed to load group members for lesson snapshot', { error, groupId });
    return { studentIds: [], studentDetails: [] };
  }

  const seen = new Set<string>();
  const studentIds: string[] = [];
  const studentDetails: Array<{ id: string; initials: string | null; grade_level: string | null }> = [];

  for (const row of memberRows || []) {
    const studentId = row.student_id;
    if (!studentId || seen.has(studentId)) continue;
    seen.add(studentId);

    // Supabase types the embedded relation as an array; a session belongs to one student.
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    studentIds.push(studentId);
    studentDetails.push({
      id: studentId,
      initials: student?.initials ?? null,
      grade_level: student?.grade_level ?? null,
    });
  }

  return { studentIds, studentDetails };
}

const saveLessonSchema = z
  .object({
    title: z.any().optional(),
    content: z.any().optional(),
    lesson_source: z.any().optional(),
    subject: z.any().optional(),
    grade_levels: z.any().optional(),
    duration_minutes: z.any().optional(),
    ai_prompt: z.any().optional(),
    notes: z.any().optional(),
    school_id: z.any().optional(),
    district_id: z.any().optional(),
    state_id: z.any().optional(),
    lesson_date: z.string().nullish(),
  })
  .passthrough();

// GET - Fetch the lesson plan for a group
export const GET = withRoute<{ groupId: string }, undefined, z.infer<typeof lessonDateQuerySchema>>(
  { query: lessonDateQuerySchema },
  async ({ userId, query, params }) => {
    const perf = measurePerformanceWithAlerts('get_group_lesson', 'api');
    const { groupId } = params;
    const lessonDate = query.lesson_date;

    try {
      const supabase = await createClient();

      log.info('Fetching group lesson', { userId, groupId, lessonDate: lessonDate || 'not specified' });

      // Verify user has access to this group
      const { data: groupSessions, error: accessError } = await supabase
        .from('schedule_sessions')
        .select('id')
        .eq('group_id', groupId)
        .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
        .limit(1);

      if (accessError || !groupSessions || groupSessions.length === 0) {
        log.warn('User does not have access to group', { userId, groupId });
        perf.end({ success: false });
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Fetch lesson for the group (optionally filtered by date)
      const fetchPerf = measurePerformanceWithAlerts('fetch_group_lesson_db', 'database');
      let lessonQuery = supabase
        .from('lessons')
        .select('*')
        .eq('group_id', groupId);

      // If lesson_date provided, filter by exact date; otherwise get most recent
      if (lessonDate) {
        lessonQuery = lessonQuery.eq('lesson_date', lessonDate);
      }

      const { data: lesson, error } = await lessonQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      fetchPerf.end({ success: !error });

      if (error) {
        log.error('Error fetching group lesson', error, { userId, groupId });
        perf.end({ success: false });
        return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 });
      }

      log.info('Group lesson fetched successfully', { userId, groupId, hasLesson: !!lesson });

      track.event('group_lesson_fetched', { userId, groupId, hasLesson: !!lesson });

      perf.end({ success: true, hasLesson: !!lesson });
      return NextResponse.json({ lesson: lesson || null });
    } catch (error) {
      log.error('Error in get-group-lesson route', error, { userId, groupId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// POST - Create or update lesson plan for a group
export const POST = withRoute<{ groupId: string }, z.infer<typeof saveLessonSchema>>(
  { body: saveLessonSchema },
  async ({ userId, body, params }) => {
    const perf = measurePerformanceWithAlerts('save_group_lesson', 'api');
    const { groupId } = params;

    try {
      const supabase = await createClient();

      const {
        title,
        content,
        lesson_source,
        subject,
        grade_levels,
        duration_minutes,
        ai_prompt,
        notes,
        school_id,
        district_id,
        state_id,
        lesson_date: requestLessonDate
      } = body;

      // Validate - at least content OR notes must be provided
      if (!content && !notes) {
        perf.end({ success: false });
        return NextResponse.json({ error: 'Content or notes is required' }, { status: 400 });
      }

      // Normalize lesson date - use provided date or default to today
      const lessonDate = requestLessonDate || new Date().toISOString().split('T')[0];

      log.info('Creating/updating group lesson', {
        userId,
        groupId,
        lesson_source: lesson_source || 'manual',
        title,
        lessonDate
      });

      // Verify user has access to this group
      const { data: groupSessions, error: accessError } = await supabase
        .from('schedule_sessions')
        .select('id')
        .eq('group_id', groupId)
        .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
        .limit(1);

      if (accessError || !groupSessions || groupSessions.length === 0) {
        log.warn('User does not have access to group', { userId, groupId });
        perf.end({ success: false });
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Check if a lesson already exists for this group AND date
      const { data: existingLesson, error: existingLessonError } = await supabase
        .from('lessons')
        .select('id, lesson_date')
        .eq('group_id', groupId)
        .eq('lesson_date', lessonDate)
        .maybeSingle();

      if (existingLessonError) {
        log.error('Error checking for existing group lesson', existingLessonError, { userId, groupId, lessonDate });
        perf.end({ success: false });
        return NextResponse.json({ error: 'Failed to save lesson' }, { status: 500 });
      }

      // Resolve the durable group_ref for this legacy group_id (any session
      // carrying the id points at the session_groups record — for groups minted
      // by the dual-write, that id is NOT the legacy group_id). Group lessons
      // must carry group_ref too, or Groups v2 continuity and the Phase 1b
      // backfill would attach them to a placeholder instead of the real group.
      const { data: refRow } = await supabase
        .from('schedule_sessions')
        .select('group_ref')
        .eq('group_id', groupId)
        .not('group_ref', 'is', null)
        .limit(1)
        .maybeSingle();
      const groupRef = refRow?.group_ref ?? null;

      // Snapshot the group's current members so this lesson stays legible even
      // after a later reshuffle/dissolve (mirrors the AI-lesson pattern).
      const { studentIds, studentDetails } = await buildGroupMemberSnapshot(supabase, groupId);
      const hasSnapshot = studentIds.length > 0;

      let data;
      let error;

      if (existingLesson) {
        // Update existing lesson
        const updatePerf = measurePerformanceWithAlerts('update_group_lesson_db', 'database');
        const result = await supabase
          .from('lessons')
          .update({
            lesson_date: lessonDate,
            title: title || null,
            content: content || {},
            lesson_source: lesson_source || 'manual',
            subject: subject || null,
            grade_levels: grade_levels || null,
            duration_minutes: duration_minutes || null,
            ai_prompt: ai_prompt || null,
            notes: notes || null,
            school_id: school_id || null,
            district_id: district_id || null,
            state_id: state_id || null,
            // Only refresh the snapshot when current members are resolvable;
            // otherwise preserve the existing (historical) snapshot rather than
            // wiping it to empty on an edit made after the group dissolved.
            ...(hasSnapshot ? { student_ids: studentIds, student_details: studentDetails } : {}),
            ...(groupRef ? { group_ref: groupRef } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingLesson.id)
          .select('*')
          .single();
        updatePerf.end({ success: !result.error });
        data = result.data;
        error = result.error;
      } else {
        // Create new lesson
        const createPerf = measurePerformanceWithAlerts('create_group_lesson_db', 'database');
        const result = await supabase
          .from('lessons')
          .insert({
            provider_id: userId,
            group_id: groupId,
            lesson_date: lessonDate,
            title: title || null,
            content: content || {},
            lesson_source: lesson_source || 'manual',
            subject: subject || null,
            grade_levels: grade_levels || null,
            duration_minutes: duration_minutes || null,
            ai_prompt: ai_prompt || null,
            notes: notes || null,
            school_id: school_id || null,
            district_id: district_id || null,
            state_id: state_id || null,
            student_ids: studentIds,
            student_details: studentDetails,
            ...(groupRef ? { group_ref: groupRef } : {})
          })
          .select('*')
          .single();
        createPerf.end({ success: !result.error });
        data = result.data;
        error = result.error;
      }

      if (error) {
        log.error('Error saving group lesson', error, { userId, groupId });
        perf.end({ success: false });
        return NextResponse.json({ error: 'Failed to save lesson' }, { status: 500 });
      }

      log.info('Group lesson saved successfully', {
        userId,
        groupId,
        lessonId: data.id,
        isUpdate: !!existingLesson
      });

      track.event(existingLesson ? 'group_lesson_updated' : 'group_lesson_created', {
        userId,
        groupId,
        lessonId: data.id,
        lesson_source: lesson_source || 'manual'
      });

      perf.end({ success: true, lessonId: data.id });
      return NextResponse.json({ lesson: data }, { status: existingLesson ? 200 : 201 });
    } catch (error) {
      log.error('Error in save-group-lesson route', error, { userId, groupId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// DELETE - Delete the lesson plan for a group
export const DELETE = withRoute<{ groupId: string }, undefined, z.infer<typeof lessonDateQuerySchema>>(
  { query: lessonDateQuerySchema },
  async ({ userId, query, params }) => {
    const perf = measurePerformanceWithAlerts('delete_group_lesson', 'api');
    const { groupId } = params;
    const lessonDate = query.lesson_date;

    try {
      const supabase = await createClient();

      log.info('Deleting group lesson', { userId, groupId, lessonDate: lessonDate || 'all dates' });

      // Verify user has access to this group
      const { data: groupSessions, error: accessError } = await supabase
        .from('schedule_sessions')
        .select('id')
        .eq('group_id', groupId)
        .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
        .limit(1);

      if (accessError || !groupSessions || groupSessions.length === 0) {
        log.warn('User does not have access to group', { userId, groupId });
        perf.end({ success: false });
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Delete the lesson (optionally filtered by date)
      const deletePerf = measurePerformanceWithAlerts('delete_group_lesson_db', 'database');
      let deleteQuery = supabase
        .from('lessons')
        .delete()
        .eq('group_id', groupId)
        .eq('provider_id', userId); // Ensure user owns the lesson

      // If lesson_date provided, only delete that specific lesson
      if (lessonDate) {
        deleteQuery = deleteQuery.eq('lesson_date', lessonDate);
      }

      const { error } = await deleteQuery;
      deletePerf.end({ success: !error });

      if (error) {
        log.error('Error deleting group lesson', error, { userId, groupId });
        perf.end({ success: false });
        return NextResponse.json({ error: 'Failed to delete lesson' }, { status: 500 });
      }

      log.info('Group lesson deleted successfully', { userId, groupId });

      track.event('group_lesson_deleted', { userId, groupId });

      perf.end({ success: true });
      return NextResponse.json({ success: true });
    } catch (error) {
      log.error('Error in delete-group-lesson route', error, { userId, groupId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
