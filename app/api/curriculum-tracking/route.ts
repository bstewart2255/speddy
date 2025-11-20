import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

// GET - Fetch curriculum tracking by group_id or session_id
export async function GET(request: NextRequest) {
  const perf = measurePerformanceWithAlerts('get_curriculum_tracking', 'api');
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('groupId');
    const sessionId = searchParams.get('sessionId');

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    // Validate that either groupId or sessionId is provided
    if (!groupId && !sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Either groupId or sessionId is required' },
        { status: 400 }
      );
    }

    log.info('Fetching curriculum tracking', {
      userId,
      groupId,
      sessionId
    });

    // Build query based on groupId or sessionId
    let query = supabase
      .from('curriculum_tracking')
      .select('*');

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      log.error('Error fetching curriculum tracking', error, {
        userId,
        groupId,
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
      groupId,
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
      groupId,
      sessionId,
      curriculumType,
      curriculumLevel,
      currentLesson
    } = body;

    // Validate required fields
    if (!curriculumType || !curriculumLevel || !currentLesson) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'curriculumType, curriculumLevel, and currentLesson are required' },
        { status: 400 }
      );
    }

    // Validate that either groupId or sessionId is provided
    if (!groupId && !sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Either groupId or sessionId is required' },
        { status: 400 }
      );
    }

    // Validate that only one is provided
    if (groupId && sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Cannot provide both groupId and sessionId' },
        { status: 400 }
      );
    }

    log.info('Creating/updating curriculum tracking', {
      userId,
      groupId,
      sessionId,
      curriculumType,
      curriculumLevel,
      currentLesson
    });

    // Verify user has access to the group or session
    if (groupId) {
      const { data: groupSessions, error: accessError } = await supabase
        .from('schedule_sessions')
        .select('id')
        .eq('group_id', groupId)
        .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
        .limit(1);

      if (accessError || !groupSessions || groupSessions.length === 0) {
        log.warn('User does not have access to group', {
          userId,
          groupId
        });
        perf.end({ success: false });
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    } else if (sessionId) {
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
    }

    // Check if curriculum tracking already exists
    let query = supabase
      .from('curriculum_tracking')
      .select('*');

    if (groupId) {
      query = query.eq('group_id', groupId).eq('curriculum_type', curriculumType);
    } else if (sessionId) {
      query = query.eq('session_id', sessionId).eq('curriculum_type', curriculumType);
    }

    const { data: existing } = await query.maybeSingle();

    let data;
    let error;

    if (existing) {
      // Update existing curriculum tracking
      const updatePerf = measurePerformanceWithAlerts('update_curriculum_tracking_db', 'database');
      const result = await supabase
        .from('curriculum_tracking')
        .update({
          curriculum_level: curriculumLevel,
          current_lesson: currentLesson,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      updatePerf.end({ success: !result.error });
      data = result.data;
      error = result.error;
    } else {
      // Create new curriculum tracking
      const createPerf = measurePerformanceWithAlerts('create_curriculum_tracking_db', 'database');
      const result = await supabase
        .from('curriculum_tracking')
        .insert({
          group_id: groupId || null,
          session_id: sessionId || null,
          curriculum_type: curriculumType,
          curriculum_level: curriculumLevel,
          current_lesson: currentLesson
        })
        .select('*')
        .single();
      createPerf.end({ success: !result.error });
      data = result.data;
      error = result.error;
    }

    if (error) {
      log.error('Error saving curriculum tracking', error, {
        userId,
        groupId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to save curriculum tracking' },
        { status: 500 }
      );
    }

    log.info('Curriculum tracking saved successfully', {
      userId,
      groupId,
      sessionId,
      trackingId: data.id,
      isUpdate: !!existing
    });

    track.event(existing ? 'curriculum_tracking_updated' : 'curriculum_tracking_created', {
      userId,
      groupId,
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

// PUT - Update lesson number (for "Next Lesson" functionality)
export async function PUT(request: NextRequest) {
  const perf = measurePerformanceWithAlerts('advance_curriculum_lesson', 'api');
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
    const { groupId, sessionId, action } = body;

    // Validate action
    if (action !== 'next') {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Only "next" action is currently supported' },
        { status: 400 }
      );
    }

    // Validate that either groupId or sessionId is provided
    if (!groupId && !sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Either groupId or sessionId is required' },
        { status: 400 }
      );
    }

    log.info('Advancing curriculum lesson', {
      userId,
      groupId,
      sessionId
    });

    // Fetch current curriculum tracking
    let query = supabase
      .from('curriculum_tracking')
      .select('*');

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data: current, error: fetchError } = await query.maybeSingle();

    if (fetchError || !current) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Curriculum tracking not found' },
        { status: 404 }
      );
    }

    // Increment lesson number
    const updatePerf = measurePerformanceWithAlerts('increment_lesson_number_db', 'database');
    const { data, error } = await supabase
      .from('curriculum_tracking')
      .update({
        current_lesson: current.current_lesson + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', current.id)
      .select('*')
      .single();
    updatePerf.end({ success: !error });

    if (error) {
      log.error('Error advancing curriculum lesson', error, {
        userId,
        groupId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to advance lesson' },
        { status: 500 }
      );
    }

    log.info('Curriculum lesson advanced successfully', {
      userId,
      groupId,
      sessionId,
      newLesson: data.current_lesson
    });

    track.event('curriculum_lesson_advanced', {
      userId,
      groupId,
      sessionId,
      previousLesson: current.current_lesson,
      newLesson: data.current_lesson
    });

    perf.end({ success: true, newLesson: data.current_lesson });
    return NextResponse.json({ data });
  } catch (error) {
    log.error('Error in advance-curriculum-lesson route', error, { userId });
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
    const groupId = searchParams.get('groupId');
    const sessionId = searchParams.get('sessionId');

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    // Validate that either groupId or sessionId is provided
    if (!groupId && !sessionId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Either groupId or sessionId is required' },
        { status: 400 }
      );
    }

    log.info('Deleting curriculum tracking', {
      userId,
      groupId,
      sessionId
    });

    // Build delete query
    let query = supabase
      .from('curriculum_tracking')
      .delete();

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const deletePerf = measurePerformanceWithAlerts('delete_curriculum_tracking_db', 'database');
    const { error } = await query;
    deletePerf.end({ success: !error });

    if (error) {
      log.error('Error deleting curriculum tracking', error, {
        userId,
        groupId,
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
      groupId,
      sessionId
    });

    track.event('curriculum_tracking_deleted', {
      userId,
      groupId,
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
