import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ groupId: string }> }
) {
  const perf = measurePerformanceWithAlerts('get_group_modal_data', 'api');
  const params = await props.params;
  const { groupId } = params;
  let userId: string | undefined;

  const searchParams = request.nextUrl.searchParams;
  const sessionDate = searchParams.get('session_date');
  const sessionId = searchParams.get('session_id');

  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    log.info('Fetching consolidated group modal data', {
      userId,
      groupId,
      sessionDate,
      sessionId
    });

    const { data: accessCheck, error: accessError } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('group_id', groupId)
      .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
      .limit(1);

    if (accessError || !accessCheck || accessCheck.length === 0) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const results = await Promise.all([
      sessionDate
        ? supabase
            .from('lessons')
            .select('*')
            .eq('group_id', groupId)
            .eq('lesson_date', sessionDate)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : supabase
            .from('lessons')
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),

      sessionDate
        ? supabase
            .from('documents')
            .select('*')
            .eq('documentable_type', 'group')
            .eq('documentable_id', groupId)
            .eq('session_date', sessionDate)
            .order('created_at', { ascending: false })
        : supabase
            .from('documents')
            .select('*')
            .eq('documentable_type', 'group')
            .eq('documentable_id', groupId)
            .order('created_at', { ascending: false }),

      sessionId
        ? supabase
            .from('curriculum_tracking')
            .select('*')
            .eq('session_id', sessionId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      sessionDate && sessionId
        ? fetchPreviousCurriculum(supabase, groupId, sessionDate, sessionId, userId)
        : Promise.resolve(null)
    ]);

    const [lessonResult, documentsResult, curriculumResult, previousCurriculumData] = results;

    if (lessonResult.error) {
      log.warn('Error fetching lesson in group modal data', { error: lessonResult.error, userId, groupId });
    }
    if (documentsResult.error) {
      log.warn('Error fetching documents in group modal data', { error: documentsResult.error, userId, groupId });
    }
    if (curriculumResult.error) {
      log.warn('Error fetching curriculum in group modal data', { error: curriculumResult.error, userId, groupId });
    }

    perf.end({ success: true });
    return NextResponse.json({
      lesson: lessonResult.data || null,
      documents: documentsResult.data || [],
      curriculum: curriculumResult.data || null,
      previousCurriculum: previousCurriculumData
    });
  } catch (error) {
    log.error('Error in get-group-modal-data route', error, { userId, groupId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function fetchPreviousCurriculum(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  sessionDate: string,
  sessionId: string,
  userId: string
) {
  try {
    const { data: currentCurriculum } = await supabase
      .from('curriculum_tracking')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (currentCurriculum) {
      return {
        data: currentCurriculum,
        isCurrentInstance: true,
        isFirstInstance: false
      };
    }

    const { data: previousCurriculum, error } = await supabase
      .from('curriculum_tracking')
      .select(`
        *,
        schedule_sessions!inner (
          id,
          session_date,
          group_id
        )
      `)
      .eq('schedule_sessions.group_id', groupId)
      .lt('schedule_sessions.session_date', sessionDate)
      .order('schedule_sessions(session_date)', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log.warn('Error fetching previous curriculum', { error, userId, groupId });
      return null;
    }

    return {
      data: previousCurriculum ? {
        curriculum_type: previousCurriculum.curriculum_type,
        curriculum_level: previousCurriculum.curriculum_level,
        current_lesson: previousCurriculum.current_lesson,
        prompt_answered: previousCurriculum.prompt_answered
      } : null,
      isFirstInstance: !previousCurriculum,
      isCurrentInstance: false
    };
  } catch (error) {
    log.warn('Error in fetchPreviousCurriculum helper', { error, userId, groupId });
    return null;
  }
}
