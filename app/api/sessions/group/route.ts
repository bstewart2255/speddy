import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withRoute } from '@/lib/api/with-route';

// POST - Group sessions together
const groupSessionsSchema = z
  .object({
    sessionIds: z
      .array(z.string())
      .min(2)
      .refine(ids => new Set(ids).size >= 2, 'At least 2 distinct sessions are required'),
    groupName: z.string().refine(s => s.trim().length > 0, 'Group name is required'),
    groupId: z.string().nullish(),
    groupColor: z.any().optional(),
  })
  .passthrough();

export const POST = withRoute({ body: groupSessionsSchema }, async ({ userId, body }) => {
  const perf = measurePerformanceWithAlerts('group_sessions', 'api');

  try {
    const supabase = await createClient();
    const { sessionIds, groupName, groupId, groupColor } = body;

    // Validate group color if provided (must be integer 0-4)
    const validatedGroupColor = typeof groupColor === 'number' && Number.isInteger(groupColor) && groupColor >= 0 && groupColor <= 4
      ? groupColor
      : null;

    // Generate a new group ID if not provided, or use the provided one
    const finalGroupId = groupId || crypto.randomUUID();

    // Immutability floor: grouping only ever touches today's and future
    // instances (plus the template). Retroactively stamping a brand-new group
    // onto already-delivered past instances would rewrite history — the very
    // thing Groups v2 forbids. Matches the ungroup route's floor.
    const todayISO = new Date().toISOString().split('T')[0];

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
      .select('id, provider_id, delivered_by, assigned_to_specialist_id, assigned_to_sea_id')
      .in('id', sessionIds);

    if (fetchError) {
      log.error('Error fetching sessions for grouping', fetchError, { userId, sessionIds });
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    // Note: Authorization is enforced via ownership and delivered_by validation below and RLS policies

    // Log all sessions being validated for debugging
    const sessionDetails = existingSessions?.map(s => ({
      id: s.id,
      provider_id: s.provider_id,
      delivered_by: s.delivered_by,
      assigned_to_specialist_id: s.assigned_to_specialist_id,
      assigned_to_sea_id: s.assigned_to_sea_id,
      isOwner: s.provider_id === userId,
      isAssignedSpecialist: s.assigned_to_specialist_id === userId,
      isAssignedSea: s.assigned_to_sea_id === userId
    }));

    log.info('Validating sessions for grouping', {
      userId,
      sessionCount: existingSessions?.length || 0,
      sessionDetails: JSON.stringify(sessionDetails)
    });

    // Verify all sessions are either owned by user OR assigned to user
    const unauthorizedSessions = existingSessions?.filter(s => {
      // User owns the session (regardless of who's delivering)
      // This allows providers to group their own templates even if instances are assigned to others
      if (s.provider_id === userId) {
        return false; // Authorized
      }

      // User is assigned to deliver as specialist
      if (s.assigned_to_specialist_id === userId) {
        return false; // Authorized
      }

      // User is assigned to deliver as SEA
      if (s.assigned_to_sea_id === userId) {
        return false; // Authorized
      }

      return true; // Unauthorized
    });

    if (unauthorizedSessions && unauthorizedSessions.length > 0) {
      log.warn('Attempted to group sessions not owned or assigned to user', {
        userId,
        unauthorizedSessionIds: unauthorizedSessions.map(s => s.id),
        unauthorizedDetails: unauthorizedSessions.map(s => ({
          sessionId: s.id,
          provider_id: s.provider_id,
          ownedByUser: s.provider_id === userId,
          deliveredBy: s.delivered_by,
          assignedToSpecialist: s.assigned_to_specialist_id,
          assignedToSea: s.assigned_to_sea_id
        }))
      });
      perf.end({ success: false, error: 'unauthorized' });
      return NextResponse.json(
        { error: 'You can only group sessions that you own or are assigned to deliver' },
        { status: 403 }
      );
    }

    // Groups v2 (Phase 1a) dual-write: mint or reuse the durable session_groups
    // record and stamp group_ref alongside the legacy group_id/name/color. This
    // is best-effort — a failure here never blocks the legacy grouping. Phase 2
    // moves this into the transactional mutation layer.
    const firstSession = existingSessions?.[0];
    let groupRef: string | null = null;
    if (groupId) {
      // Adding to an existing group: reuse its session_groups id if one exists.
      const { data: sibling } = await supabase
        .from('schedule_sessions')
        .select('group_ref')
        .eq('group_id', groupId)
        .not('group_ref', 'is', null)
        .limit(1)
        .maybeSingle();
      groupRef = sibling?.group_ref ?? null;
    }
    // Only the owning provider mints the durable record here: RLS on
    // session_groups is owner-only (provider_id = auth.uid()), and the record
    // must be owned by the provider, not by a delegated SEA/specialist who may be
    // acting. For delegated grouping (actor != owner) we intentionally skip the
    // durable write — the legacy columns still carry the grouping, and the Phase
    // 1b backfill / Phase 2 mutation layer create the durable record with correct
    // ownership. This keeps an unprivileged actor from being silently RLS-rejected.
    if (!groupRef && firstSession && firstSession.provider_id === userId) {
      const deliveredBy = firstSession.delivered_by ?? 'provider';
      const { data: newGroup, error: groupErr } = await supabase
        .from('session_groups')
        .insert({
          provider_id: userId,
          delivered_by: deliveredBy,
          assigned_to_sea_id: deliveredBy === 'sea' ? firstSession.assigned_to_sea_id ?? null : null,
          assigned_to_specialist_id:
            deliveredBy === 'specialist' ? firstSession.assigned_to_specialist_id ?? null : null,
          name: groupName.trim(),
          color: validatedGroupColor,
        })
        .select('id')
        .single();
      if (groupErr) {
        log.warn('Failed to create session_groups record (legacy group unaffected)', {
          error: groupErr,
          userId,
          groupId: finalGroupId,
        });
      } else {
        groupRef = newGroup?.id ?? null;
      }
    }

    // Update template sessions with group information
    const updatePerf = measurePerformanceWithAlerts('update_session_groups', 'database');
    const { data: updatedSessions, error: updateError } = await supabase
      .from('schedule_sessions')
      .update({
        group_id: finalGroupId,
        group_name: groupName.trim(),
        group_color: validatedGroupColor,
        ...(groupRef ? { group_ref: groupRef } : {}),
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
        // Update all instances that match this template. provider_id is part
        // of the match so we never touch instances owned by a different
        // provider that happen to share student/day/time.
        const { error: instanceError } = await supabase
          .from('schedule_sessions')
          .update({
            group_id: finalGroupId,
            group_name: groupName.trim(),
            group_color: validatedGroupColor,
            ...(groupRef ? { group_ref: groupRef } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('provider_id', template.provider_id)
          .eq('student_id', template.student_id)
          .eq('day_of_week', template.day_of_week)
          .eq('start_time', template.start_time)
          .not('session_date', 'is', null) // Only update instances, not templates again
          .gte('session_date', todayISO); // Future-only: never regroup delivered past instances

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
