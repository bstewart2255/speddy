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

    // Verify that all sessions belong to the current user and match delivered_by
    const { data: existingSessions, error: fetchError } = await supabase
      .from('schedule_sessions')
      .select('id, provider_id, delivered_by, group_id, group_name, student_id, day_of_week, start_time, session_date')
      .in('id', sessionIds);

    if (fetchError) {
      log.error('Error fetching sessions for ungrouping', fetchError, { userId, sessionIds });
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    // Note: Authorization is enforced via delivered_by validation below and RLS policies

    // Get user's role to validate delivered_by
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      log.error('Error fetching user profile', profileError, { userId });
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to verify user permissions' },
        { status: 500 }
      );
    }

    // Map role to expected delivered_by value
    const roleToDeliveredBy: Record<string, string> = {
      'provider': 'provider',
      'sea': 'sea',
      'specialist': 'specialist'
    };

    const expectedDeliveredBy = roleToDeliveredBy[userProfile.role];
    if (!expectedDeliveredBy) {
      log.warn('Invalid user role for ungrouping', { userId, role: userProfile.role });
      perf.end({ success: false, error: 'invalid_role' });
      return NextResponse.json(
        { error: 'Your role is not authorized to ungroup sessions' },
        { status: 403 }
      );
    }

    // Verify all sessions have matching delivered_by
    const mismatchedSessions = existingSessions?.filter(
      s => s.delivered_by !== expectedDeliveredBy
    );
    if (mismatchedSessions && mismatchedSessions.length > 0) {
      log.warn('Attempted to ungroup sessions not assigned to user', {
        userId,
        userRole: userProfile.role,
        expectedDeliveredBy,
        mismatchedSessionIds: mismatchedSessions.map(s => s.id)
      });
      perf.end({ success: false, error: 'invalid_delivered_by' });
      return NextResponse.json(
        { error: 'You can only ungroup sessions that you are assigned to deliver' },
        { status: 403 }
      );
    }

    // Update sessions to remove group information
    const updatePerf = measurePerformanceWithAlerts('remove_session_groups', 'database');
    const { data: updatedSessions, error: updateError } = await supabase
      .from('schedule_sessions')
      .update({
        group_id: null,
        group_name: null,
        updated_at: new Date().toISOString()
      })
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
            group_name: null,
            updated_at: new Date().toISOString()
          })
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
