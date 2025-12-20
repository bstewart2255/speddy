import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

// GET - Fetch curriculum tracking by session_id
export async function GET(request: NextRequest) {
  const perf = measurePerformanceWithAlerts('get_curriculum_tracking', 'api');
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    // Validate that sessionId is provided
    if (!sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    log.info('Fetching curriculum tracking', {
      userId,
      sessionId
    });

    const { data, error } = await supabase
      .from('curriculum_tracking')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      log.error('Error fetching curriculum tracking', error, {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to fetch curriculum tracking' },
        { status: 500 }
      );
    }

    log.info('Curriculum tracking fetched successfully', {
      userId,
      sessionId,
      hasData: !!data
    });

    perf.end({ success: true, hasData: !!data });
    return NextResponse.json({ data: data || null });
  } catch (error) {
    log.error('Error in get-curriculum-tracking route', error, { userId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create or update curriculum tracking
export async function POST(request: NextRequest) {
  const perf = measurePerformanceWithAlerts('save_curriculum_tracking', 'api');
  let userId: string | undefined;

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const body = await request.json();
    const {
      sessionId,
      curriculumType,
      curriculumLevel,
      currentLesson,
      promptAnswered
    } = body;

    // Validate required fields
    if (!curriculumType || !curriculumLevel || !currentLesson) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'curriculumType, curriculumLevel, and currentLesson are required' },
        { status: 400 }
      );
    }

    // Validate that sessionId is provided
    if (!sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

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
      log.warn('User does not have access to session', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
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
      return NextResponse.json(
        { error: 'Curriculum tracking save returned no data' },
        { status: 500 }
      );
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete curriculum tracking
export async function DELETE(request: NextRequest) {
  const perf = measurePerformanceWithAlerts('delete_curriculum_tracking', 'api');
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    // Validate that sessionId is provided
    if (!sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    log.info('Deleting curriculum tracking', {
      userId,
      sessionId
    });

    const deletePerf = measurePerformanceWithAlerts('delete_curriculum_tracking_db', 'database');
    const { error } = await supabase
      .from('curriculum_tracking')
      .delete()
      .eq('session_id', sessionId);
    deletePerf.end({ success: !error });

    if (error) {
      log.error('Error deleting curriculum tracking', error, {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to delete curriculum tracking' },
        { status: 500 }
      );
    }

    log.info('Curriculum tracking deleted successfully', {
      userId,
      sessionId
    });

    track.event('curriculum_tracking_deleted', {
      userId,
      sessionId
    });

    perf.end({ success: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in delete-curriculum-tracking route', error, { userId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
