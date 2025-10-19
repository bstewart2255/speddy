import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

// GET - Fetch the lesson plan for a group
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('get_group_lesson', 'api');
  const params = await props.params;
  const { groupId } = params;

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    log.info('Fetching group lesson', {
      userId,
      groupId
    });

    // Verify user has access to this group
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

    // Fetch lesson for the group
    const fetchPerf = measurePerformanceWithAlerts('fetch_group_lesson_db', 'database');
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    fetchPerf.end({ success: !error });

    if (error) {
      log.error('Error fetching group lesson', error, {
        userId,
        groupId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to fetch lesson' },
        { status: 500 }
      );
    }

    log.info('Group lesson fetched successfully', {
      userId,
      groupId,
      hasLesson: !!lesson
    });

    track.event('group_lesson_fetched', {
      userId,
      groupId,
      hasLesson: !!lesson
    });

    perf.end({ success: true, hasLesson: !!lesson });
    return NextResponse.json({ lesson: lesson || null });
  } catch (error) {
    log.error('Error in get-group-lesson route', error, { userId, groupId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create or update lesson plan for a group
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('save_group_lesson', 'api');
  const params = await props.params;
  const { groupId } = params;

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    const body = await request.json();
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
      state_id
    } = body;

    // Validate required fields
    if (!content) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    log.info('Creating/updating group lesson', {
      userId,
      groupId,
      lesson_source: lesson_source || 'manual',
      title
    });

    // Verify user has access to this group
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

    // Check if a lesson already exists for this group
    const { data: existingLesson } = await supabase
      .from('lessons')
      .select('id')
      .eq('group_id', groupId)
      .limit(1)
      .maybeSingle();

    let data;
    let error;

    if (existingLesson) {
      // Update existing lesson
      const updatePerf = measurePerformanceWithAlerts('update_group_lesson_db', 'database');
      const result = await supabase
        .from('lessons')
        .update({
          title: title || null,
          content,
          lesson_source: lesson_source || 'manual',
          subject: subject || null,
          grade_levels: grade_levels || null,
          duration_minutes: duration_minutes || null,
          ai_prompt: ai_prompt || null,
          notes: notes || null,
          school_id: school_id || null,
          district_id: district_id || null,
          state_id: state_id || null,
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
          title: title || null,
          content,
          lesson_source: lesson_source || 'manual',
          subject: subject || null,
          grade_levels: grade_levels || null,
          duration_minutes: duration_minutes || null,
          ai_prompt: ai_prompt || null,
          notes: notes || null,
          school_id: school_id || null,
          district_id: district_id || null,
          state_id: state_id || null
        })
        .select('*')
        .single();
      createPerf.end({ success: !result.error });
      data = result.data;
      error = result.error;
    }

    if (error) {
      log.error('Error saving group lesson', error, {
        userId,
        groupId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to save lesson' },
        { status: 500 }
      );
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete the lesson plan for a group
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('delete_group_lesson', 'api');
  const params = await props.params;
  const { groupId } = params;

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    log.info('Deleting group lesson', {
      userId,
      groupId
    });

    // Verify user has access to this group
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

    // Delete the lesson
    const deletePerf = measurePerformanceWithAlerts('delete_group_lesson_db', 'database');
    const { error } = await supabase
      .from('lessons')
      .delete()
      .eq('group_id', groupId)
      .eq('provider_id', userId); // Ensure user owns the lesson
    deletePerf.end({ success: !error });

    if (error) {
      log.error('Error deleting group lesson', error, {
        userId,
        groupId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to delete lesson' },
        { status: 500 }
      );
    }

    log.info('Group lesson deleted successfully', {
      userId,
      groupId
    });

    track.event('group_lesson_deleted', {
      userId,
      groupId
    });

    perf.end({ success: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in delete-group-lesson route', error, { userId, groupId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
