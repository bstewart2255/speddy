import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withRoute } from '@/lib/api/with-route';

const sessionIdQuerySchema = z.object({
  sessionId: z.string().min(1),
});

const saveCurriculumSchema = z
  .object({
    sessionId: z.string().min(1),
    curriculumType: z.string().min(1),
    curriculumLevel: z.string().min(1),
    currentLesson: z.number(),
    promptAnswered: z.boolean().optional(),
  })
  .passthrough();

// GET - Fetch curriculum tracking by session_id
export const GET = withRoute({ query: sessionIdQuerySchema }, async ({ userId, query }) => {
  const perf = measurePerformanceWithAlerts('get_curriculum_tracking', 'api');
  const { sessionId } = query;

  try {
    const supabase = await createClient();

    log.info('Fetching curriculum tracking', { userId, sessionId });

    const { data, error } = await supabase
      .from('curriculum_tracking')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      log.error('Error fetching curriculum tracking', error, { userId, sessionId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Failed to fetch curriculum tracking' }, { status: 500 });
    }

    log.info('Curriculum tracking fetched successfully', { userId, sessionId, hasData: !!data });

    perf.end({ success: true, hasData: !!data });
    return NextResponse.json({ data: data || null });
  } catch (error) {
    log.error('Error in get-curriculum-tracking route', error, { userId });
    perf.end({ success: false });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST - Create or update curriculum tracking
export const POST = withRoute({ body: saveCurriculumSchema }, async ({ userId, body }) => {
  const perf = measurePerformanceWithAlerts('save_curriculum_tracking', 'api');
  const { sessionId, curriculumType, curriculumLevel, currentLesson, promptAnswered } = body;

  try {
    const supabase = await createClient();

    log.info('Creating/updating curriculum tracking', {
      userId,
      sessionId,
      curriculumType,
      curriculumLevel,
      currentLesson
    });

    // Verify user has access to the session
    const { data: session, error: accessError } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('id', sessionId)
      .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (accessError || !session) {
      log.warn('User does not have access to session', { userId, sessionId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Use service client for database operations (bypasses RLS since we've verified access above)
    // This avoids potential RLS context issues with server-side auth
    const serviceClient = createServiceClient();

    // Check if curriculum tracking already exists for this session
    const { data: existing } = await serviceClient
      .from('curriculum_tracking')
      .select('*')
      .eq('session_id', sessionId)
      .eq('curriculum_type', curriculumType)
      .maybeSingle();

    let data;
    let error;

    log.info('Attempting to save curriculum tracking', {
      userId,
      sessionId,
      curriculumType,
      curriculumLevel,
      currentLesson,
      hasExisting: !!existing
    });

    if (existing) {
      // Update existing curriculum tracking
      const updatePerf = measurePerformanceWithAlerts('update_curriculum_tracking_db', 'database');
      const result = await serviceClient
        .from('curriculum_tracking')
        .update({
          curriculum_level: curriculumLevel,
          current_lesson: currentLesson,
          updated_at: new Date().toISOString(),
          ...(promptAnswered !== undefined && { prompt_answered: promptAnswered })
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      updatePerf.end({ success: !result.error });
      data = result.data;
      error = result.error;

      log.info('Update result', {
        userId,
        sessionId,
        existingId: existing.id,
        hasData: !!data,
        hasError: !!error,
        errorMessage: error?.message
      });
    } else {
      // Create new curriculum tracking
      const createPerf = measurePerformanceWithAlerts('create_curriculum_tracking_db', 'database');
      const result = await serviceClient
        .from('curriculum_tracking')
        .insert({
          session_id: sessionId,
          curriculum_type: curriculumType,
          curriculum_level: curriculumLevel,
          current_lesson: currentLesson,
          ...(promptAnswered !== undefined && { prompt_answered: promptAnswered })
        })
        .select('*')
        .single();
      createPerf.end({ success: !result.error });
      data = result.data;
      error = result.error;

      log.info('Insert result', {
        userId,
        sessionId,
        hasData: !!data,
        dataId: data?.id,
        hasError: !!error,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorDetails: error?.details
      });
    }

    if (error) {
      log.error('Error saving curriculum tracking', error, {
        userId,
        sessionId,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to save curriculum tracking', details: error.message },
        { status: 500 }
      );
    }

    // Additional check: if no data was returned, something went wrong
    if (!data) {
      log.error('No data returned from curriculum tracking save', {
        userId,
        sessionId,
        isUpdate: !!existing
      });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Curriculum tracking save returned no data' }, { status: 500 });
    }

    log.info('Curriculum tracking saved successfully', {
      userId,
      sessionId,
      trackingId: data.id,
      isUpdate: !!existing
    });

    track.event(existing ? 'curriculum_tracking_updated' : 'curriculum_tracking_created', {
      userId,
      sessionId,
      curriculumType,
      curriculumLevel,
      currentLesson
    });

    perf.end({ success: true, trackingId: data.id });
    return NextResponse.json({ data }, { status: existing ? 200 : 201 });
  } catch (error) {
    log.error('Error in save-curriculum-tracking route', error, { userId });
    perf.end({ success: false });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// DELETE - Delete curriculum tracking
export const DELETE = withRoute({ query: sessionIdQuerySchema }, async ({ userId, query }) => {
  const perf = measurePerformanceWithAlerts('delete_curriculum_tracking', 'api');
  const { sessionId } = query;

  try {
    const supabase = await createClient();

    log.info('Deleting curriculum tracking', { userId, sessionId });

    const deletePerf = measurePerformanceWithAlerts('delete_curriculum_tracking_db', 'database');
    const { error } = await supabase
      .from('curriculum_tracking')
      .delete()
      .eq('session_id', sessionId);
    deletePerf.end({ success: !error });

    if (error) {
      log.error('Error deleting curriculum tracking', error, { userId, sessionId });
      perf.end({ success: false });
      return NextResponse.json({ error: 'Failed to delete curriculum tracking' }, { status: 500 });
    }

    log.info('Curriculum tracking deleted successfully', { userId, sessionId });

    track.event('curriculum_tracking_deleted', { userId, sessionId });

    perf.end({ success: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in delete-curriculum-tracking route', error, { userId });
    perf.end({ success: false });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
