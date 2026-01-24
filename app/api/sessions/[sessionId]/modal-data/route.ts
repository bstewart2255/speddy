import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ sessionId: string }> }
) {
  const perf = measurePerformanceWithAlerts('get_session_modal_data', 'api');
  const params = await props.params;
  const { sessionId } = params;
  let userId: string | undefined;

  const searchParams = request.nextUrl.searchParams;
  const sessionDate = searchParams.get('session_date');
  const startTime = searchParams.get('start_time');
  const endTime = searchParams.get('end_time');
  const groupId = searchParams.get('group_id');

  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    log.info('Fetching consolidated session modal data', {
      userId,
      sessionId,
      sessionDate,
      groupId
    });

    const timeSlot = startTime && endTime ? `${startTime}-${endTime}` : null;

    const results = await Promise.all([
      sessionDate && timeSlot
        ? supabase
            .from('lessons')
            .select('*')
            .eq('provider_id', userId)
            .eq('lesson_date', sessionDate)
            .eq('time_slot', timeSlot)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      sessionDate
        ? supabase
            .from('documents')
            .select('*')
            .eq('documentable_type', 'session')
            .eq('documentable_id', sessionId)
            .eq('session_date', sessionDate)
            .order('created_at', { ascending: false })
        : supabase
            .from('documents')
            .select('*')
            .eq('documentable_type', 'session')
            .eq('documentable_id', sessionId)
            .order('created_at', { ascending: false }),

      supabase
        .from('curriculum_tracking')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle()
    ]);

    const [lessonResult, documentsResult, curriculumResult] = results;

    if (lessonResult.error) {
      log.warn('Error fetching lesson in modal data', { error: lessonResult.error, userId, sessionId });
    }
    if (documentsResult.error) {
      log.warn('Error fetching documents in modal data', { error: documentsResult.error, userId, sessionId });
    }
    if (curriculumResult.error) {
      log.warn('Error fetching curriculum in modal data', { error: curriculumResult.error, userId, sessionId });
    }

    perf.end({ success: true });
    return NextResponse.json({
      lesson: lessonResult.data || null,
      documents: documentsResult.data || [],
      curriculum: curriculumResult.data || null
    });
  } catch (error) {
    log.error('Error in get-session-modal-data route', error, { userId, sessionId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
