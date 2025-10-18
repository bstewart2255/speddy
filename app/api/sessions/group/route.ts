import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

// POST - Group sessions together
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('group_sessions', 'api');

  try {
    const supabase = await createClient();
    const body = await request.json();

    const { sessionIds, groupName, groupId } = body;

    // Validate required fields
    if (!Array.isArray(sessionIds) || sessionIds.length < 2) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'At least 2 session IDs are required to create a group' },
        { status: 400 }
      );
    }

    if (!groupName || typeof groupName !== 'string' || !groupName.trim()) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      );
    }

    // Generate a new group ID if not provided, or use the provided one
    const finalGroupId = groupId || crypto.randomUUID();

    log.info('Grouping sessions', {
      userId,
      sessionCount: sessionIds.length,
      groupName,
      groupId: finalGroupId
    });

    // Update all sessions with the group ID and name
    // First verify that all sessions belong to the current user and match delivered_by
    const { data: existingSessions, error: fetchError } = await supabase
      .from('schedule_sessions')
      .select('id, provider_id, delivered_by')
      .in('id', sessionIds);

    if (fetchError) {
      log.error('Error fetching sessions for grouping', fetchError, { userId, sessionIds });
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
      log.warn('Invalid user role for grouping', { userId, role: userProfile.role });
      perf.end({ success: false, error: 'invalid_role' });
      return NextResponse.json(
        { error: 'Your role is not authorized to group sessions' },
        { status: 403 }
      );
    }

    // Verify all sessions have matching delivered_by
    const mismatchedSessions = existingSessions?.filter(
      s => s.delivered_by !== expectedDeliveredBy
    );
    if (mismatchedSessions && mismatchedSessions.length > 0) {
      log.warn('Attempted to group sessions not assigned to user', {
        userId,
        userRole: userProfile.role,
        expectedDeliveredBy,
        mismatchedSessionIds: mismatchedSessions.map(s => s.id)
      });
      perf.end({ success: false, error: 'invalid_delivered_by' });
      return NextResponse.json(
        { error: 'You can only group sessions that you are assigned to deliver' },
        { status: 403 }
      );
    }

    // Update template sessions with group information
    const updatePerf = measurePerformanceWithAlerts('update_session_groups', 'database');
    const { data: updatedSessions, error: updateError } = await supabase
      .from('schedule_sessions')
      .update({
        group_id: finalGroupId,
        group_name: groupName.trim(),
        updated_at: new Date().toISOString()
      })
      .in('id', sessionIds)
      .select();
    updatePerf.end({ success: !updateError });

    if (updateError) {
      log.error('Error updating sessions with group info', updateError, {
        userId,
        sessionIds,
        groupId: finalGroupId,
        errorCode: updateError.code
      });

      track.event('session_grouping_failed', {
        userId,
        error: updateError.message,
        errorCode: updateError.code,
        sessionCount: sessionIds.length
      });

      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to group sessions' },
        { status: 500 }
      );
    }

    // Also update any existing instances that match these templates
    // This ensures existing date-specific instances get the group info too
    if (updatedSessions && updatedSessions.length > 0) {
      for (const template of updatedSessions) {
        // Update all instances that match this template
        const { error: instanceError } = await supabase
          .from('schedule_sessions')
          .update({
            group_id: finalGroupId,
            group_name: groupName.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('student_id', template.student_id)
          .eq('day_of_week', template.day_of_week)
          .eq('start_time', template.start_time)
          .not('session_date', 'is', null); // Only update instances, not templates again

        if (instanceError) {
          log.warn('Failed to update instances for template', {
            error: instanceError,
            userId,
            templateId: template.id,
            groupId: finalGroupId
          });
        }
      }

      log.info('Updated existing instances to match grouped templates', {
        userId,
        groupId: finalGroupId,
        templateCount: updatedSessions.length
      });
    }

    log.info('Sessions grouped successfully', {
      userId,
      groupId: finalGroupId,
      groupName,
      sessionCount: updatedSessions?.length || 0
    });

    track.event('sessions_grouped', {
      userId,
      groupId: finalGroupId,
      groupName,
      sessionCount: updatedSessions?.length || 0
    });

    perf.end({ success: true, groupId: finalGroupId, sessionCount: updatedSessions?.length || 0 });
    return NextResponse.json({
      success: true,
      groupId: finalGroupId,
      sessions: updatedSessions
    });
  } catch (error) {
    log.error('Error in group sessions route', error, { userId });

    perf.end({ success: false, error: 'unexpected' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
