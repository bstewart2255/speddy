import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { withRoute } from '@/lib/api/with-route';

/**
 * Groups v2 · Phase 2 mutation layer (SPE-311).
 *
 * Thin dispatch over the transactional SECURITY DEFINER RPCs
 * (groups_v2_form/join/leave/split/merge). All the real work — ownership
 * enforcement, future-only propagation, legacy dual-write, retire-not-delete —
 * lives in Postgres so each membership change is one atomic transaction. This
 * route only validates the shape and surfaces the RPC's outcome; it deliberately
 * does NOT read-modify-write in JS (the pattern that caused this domain's
 * history of partial-update corruption — spec §1).
 */
const uuid = z.string().uuid();

const mutateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('form'), sessionIds: z.array(uuid).min(2) }),
  z.object({ action: z.literal('join'), sessionId: uuid, groupId: uuid }),
  z.object({ action: z.literal('leave'), sessionId: uuid }),
  z.object({ action: z.literal('split'), groupId: uuid, sessionIds: z.array(uuid).min(1) }),
  z.object({ action: z.literal('merge'), fromGroupId: uuid, intoGroupId: uuid }),
  z.object({
    action: z.literal('rename'),
    groupId: uuid,
    name: z.string().max(80).nullable(),
    color: z.number().int().min(0).max(4).nullable(),
  }),
  z.object({
    action: z.literal('assign'),
    groupId: uuid,
    deliveredBy: z.enum(['provider', 'sea', 'specialist']),
    assignee: uuid.nullable(),
  }),
]);

export const POST = withRoute({ body: mutateSchema }, async ({ userId, body }) => {
  const supabase = await createClient();

  // Each RPC re-derives the caller from auth.uid() and re-checks ownership, so
  // an unauthorized mutation RAISEs and rolls back the whole transaction.
  const call = () => {
    switch (body.action) {
      case 'form':
        return supabase.rpc('groups_v2_form', { p_session_ids: body.sessionIds });
      case 'join':
        return supabase.rpc('groups_v2_join', { p_session_id: body.sessionId, p_group_id: body.groupId });
      case 'leave':
        return supabase.rpc('groups_v2_leave', { p_session_id: body.sessionId });
      case 'split':
        return supabase.rpc('groups_v2_split', { p_group_id: body.groupId, p_session_ids: body.sessionIds });
      case 'merge':
        return supabase.rpc('groups_v2_merge', {
          p_from_group_id: body.fromGroupId,
          p_into_group_id: body.intoGroupId,
        });
      case 'rename':
        return supabase.rpc('groups_v2_rename', {
          p_group_id: body.groupId,
          p_name: body.name,
          p_color: body.color,
        });
      case 'assign':
        return supabase.rpc('groups_v2_assign', {
          p_group_id: body.groupId,
          p_delivered_by: body.deliveredBy,
          p_assignee: body.assignee,
        });
    }
  };

  const { data, error } = await call();

  if (error) {
    // RPC guards raise user-actionable messages (ownership, "already grouped",
    // "split must leave one behind"). Surface the message for the toast; it
    // carries no sensitive detail.
    log.warn('Group mutation failed', { userId, action: body.action, error: error.message });
    return NextResponse.json({ error: error.message || 'Group change failed' }, { status: 400 });
  }

  track.event('group_mutation', { userId, action: body.action });

  // form/split return the (new) group id; join/leave/merge return void → null.
  return NextResponse.json({ success: true, groupId: typeof data === 'string' ? data : null });
});
