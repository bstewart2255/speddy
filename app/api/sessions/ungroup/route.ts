import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

// POST - Remove sessions from their group
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('ungroup_sessions', 'api');

  try {
    const supabase = await createClient();
    const body = await request.json();

    const { sessionIds } = body;

    // Validate required fields
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'At least one session ID is required' },
        { status: 400 }
      );
    }

    log.info('Ungrouping sessions', {
      userId,
      sessionCount: sessionIds.length
    });

    // Verify that all sessions belong to the current user
    const { data: existingSessions, error: fetchError } = await supabase
      .from('schedule_sessions')
      .select('id, provider_id, group_id, group_name, student_id, day_of_week, start_time, session_date')
      .in('id', sessionIds);

    if (fetchError) {
      log.error('Error fetching sessions for ungrouping', fetchError, { userId, sessionIds });
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    // Verify all sessions belong to the user
    const invalidSessions = existingSessions?.filter(s => s.provider_id !== userId);
    if (invalidSessions && invalidSessions.length > 0) {
      log.warn('Unauthorized ungrouping attempt', {
        userId,
        invalidSessionIds: invalidSessions.map(s => s.id)
      });
      perf.end({ success: false, error: 'unauthorized' });
      return NextResponse.json(
        { error: 'Unauthorized: Some sessions do not belong to you' },
        { status: 403 }
      );
    }

    // Update sessions to remove group information
    const updatePerf = measurePerformanceWithAlerts('remove_session_groups', 'database');
    const { data: updatedSessions, error: updateError } = await supabase
      .from('schedule_sessions')
      .update({
        group_id: null,
        group_name: null
      })
      .eq('provider_id', userId)
      .in('id', sessionIds)
      .select('id, student_id, day_of_week, start_time, session_date');
    updatePerf.end({ success: !updateError });

    if (updateError) {
      log.error('Error removing group info from sessions', updateError, {
        userId,
        sessionIds,
        errorCode: updateError.code
      });

      track.event('session_ungrouping_failed', {
        userId,
        error: updateError.message,
        errorCode: updateError.code,
        sessionCount: sessionIds.length
      });

      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to ungroup sessions' },
        { status: 500 }
      );
    }

    // Also clear existing instances that match any ungrouped templates
    // This ensures that existing date-specific instances get updated too
    if (updatedSessions && updatedSessions.length > 0) {
      const templates = updatedSessions.filter(s => s.session_date == null);

      for (const template of templates) {
        const { error: instanceError } = await supabase
          .from('schedule_sessions')
          .update({
            group_id: null,
            group_name: null
          })
          .eq('provider_id', userId)
          .eq('student_id', template.student_id)
          .eq('day_of_week', template.day_of_week)
          .eq('start_time', template.start_time)
          .not('session_date', 'is', null); // Only update instances, not templates again

        if (instanceError) {
          log.warn('Failed to ungroup instances for template', {
            error: instanceError,
            userId,
            templateId: template.id
          });
        }
      }

      log.info('Updated existing instances to match ungrouped templates', {
        userId,
        templateCount: templates.length
      });
    }

    log.info('Sessions ungrouped successfully', {
      userId,
      sessionCount: updatedSessions?.length || 0
    });

    track.event('sessions_ungrouped', {
      userId,
      sessionCount: updatedSessions?.length || 0
    });

    perf.end({ success: true, sessionCount: updatedSessions?.length || 0 });
    return NextResponse.json({
      success: true,
      sessions: updatedSessions
    });
  } catch (error) {
    log.error('Error in ungroup sessions route', error, { userId });

    perf.end({ success: false, error: 'unexpected' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
