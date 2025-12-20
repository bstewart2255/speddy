import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

// Type for curriculum tracking with joined session data
interface CurriculumWithSession {
  id: string;
  session_id: string;
  curriculum_type: string;
  curriculum_level: string;
  current_lesson: number;
  prompt_answered: boolean;
  created_at: string | null;
  updated_at: string | null;
  schedule_sessions: {
    id: string;
    session_date: string | null;
    group_id?: string | null;
    student_id?: string | null;
    day_of_week?: number | null;
    start_time?: string | null;
    provider_id?: string | null;
  } | null;
}

// GET - Fetch curriculum tracking from previous instance of same recurring session
export async function GET(request: NextRequest) {
  const perf = measurePerformanceWithAlerts('get_previous_curriculum', 'api');
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const groupId = searchParams.get('groupId');
    const sessionDate = searchParams.get('sessionDate');

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    // Validate required parameters
    // sessionId is required for individual sessions, but optional for group sessions (groupId provided)
    if (!sessionDate) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'sessionDate is required' },
        { status: 400 }
      );
    }

    if (!sessionId && !groupId) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Either sessionId or groupId is required' },
        { status: 400 }
      );
    }

    log.info('Fetching previous curriculum tracking', {
      userId,
      sessionId,
      groupId,
      sessionDate
    });

    let previousCurriculum: CurriculumWithSession | null = null;

    if (groupId) {
      // For group sessions: find previous session with same group_id
      log.info('Querying previous curriculum for group', {
        userId,
        groupId,
        sessionDate,
        query: 'curriculum_tracking JOIN schedule_sessions WHERE group_id = ? AND session_date < ?'
      });

      const { data, error } = await supabase
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

      log.info('Query result for group', {
        userId,
        groupId,
        hasData: !!data,
        hasError: !!error,
        errorMessage: error?.message
      });

      if (error) {
        log.error('Error fetching previous curriculum for group', error, {
          userId,
          groupId,
          sessionDate
        });
      } else {
        previousCurriculum = data;
      }
    } else {
      // For individual sessions: find previous session matching template characteristics
      // First get the current session's characteristics
      const { data: currentSession, error: sessionError } = await supabase
        .from('schedule_sessions')
        .select('student_id, day_of_week, start_time, provider_id')
        .eq('id', sessionId)
        .single();

      if (sessionError || !currentSession) {
        log.error('Error fetching current session', sessionError, {
          userId,
          sessionId
        });
        perf.end({ success: false });
        return NextResponse.json(
          { error: 'Failed to fetch session details' },
          { status: 500 }
        );
      }

      // Find previous session with same characteristics
      const { data, error } = await supabase
        .from('curriculum_tracking')
        .select(`
          *,
          schedule_sessions!inner (
            id,
            session_date,
            student_id,
            day_of_week,
            start_time,
            provider_id
          )
        `)
        .eq('schedule_sessions.student_id', currentSession.student_id)
        .eq('schedule_sessions.day_of_week', currentSession.day_of_week)
        .eq('schedule_sessions.start_time', currentSession.start_time)
        .eq('schedule_sessions.provider_id', currentSession.provider_id)
        .lt('schedule_sessions.session_date', sessionDate)
        .order('schedule_sessions(session_date)', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        log.error('Error fetching previous curriculum for individual', error, {
          userId,
          sessionId,
          sessionDate
        });
      } else {
        previousCurriculum = data;
      }
    }

    // Check if current session already has curriculum tracking (not first instance)
    // Only check if we have a valid sessionId (not for temp sessions)
    let currentCurriculum = null;
    if (sessionId) {
      const { data } = await supabase
        .from('curriculum_tracking')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();
      currentCurriculum = data;
    }

    // Determine if this is the first instance (no previous curriculum exists)
    const isFirstInstance = !previousCurriculum;

    log.info('Previous curriculum fetched', {
      userId,
      sessionId,
      hasPrevious: !!previousCurriculum,
      hasCurrentCurriculum: !!currentCurriculum,
      isFirstInstance
    });

    perf.end({ success: true, hasPrevious: !!previousCurriculum });

    // If current session already has curriculum, return that instead
    // (user already answered or manually set curriculum)
    if (currentCurriculum) {
      return NextResponse.json({
        data: currentCurriculum,
        isFirstInstance: false,
        isCurrentInstance: true
      });
    }

    return NextResponse.json({
      data: previousCurriculum ? {
        id: previousCurriculum.id,
        curriculum_type: previousCurriculum.curriculum_type,
        curriculum_level: previousCurriculum.curriculum_level,
        current_lesson: previousCurriculum.current_lesson,
        prompt_answered: previousCurriculum.prompt_answered,
        session_id: previousCurriculum.session_id,
        previous_session_date: previousCurriculum.schedule_sessions?.session_date
      } : null,
      isFirstInstance
    });
  } catch (error) {
    log.error('Error in get-previous-curriculum route', error, { userId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
