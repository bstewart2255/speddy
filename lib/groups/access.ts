import type { createClient } from '@/lib/supabase/server';

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Groups v2 access rule (SPE-311).
 *
 * A user may read a group's content (lessons, documents, curriculum) if they own
 * or are the current assignee of the DURABLE group record — the `group_ref`
 * chain — regardless of who currently sits in the group's live membership. This
 * is the fix for the original defect: reshuffling a group's sessions used to make
 * the whole past+future group trail unreachable because access was gated on the
 * live `schedule_sessions.group_id` membership.
 *
 * During the dual-write bake, a group may not yet carry a `group_ref` (legacy
 * groups pending the held Phase 1b backfill), so we also accept the legacy
 * live-membership path. Both reads are RLS-gated — `session_groups` SELECT is
 * owner-or-assignee only, and the legacy query filters on the caller — so a
 * non-owner / non-assignee is granted nothing by either path. The legacy path is
 * removed in Phase 5 once every group is backfilled to `group_ref`.
 *
 * The URL/route `groupId` is the legacy group id. The durable record's id is that
 * same id when backfilled (identity-mapped), otherwise the `group_ref` stamped on
 * a live session carrying the legacy id.
 */
export async function hasGroupAccess(
  supabase: SupabaseServer,
  groupId: string,
  userId: string
): Promise<boolean> {
  // Path A — durable group record (owner or current assignee), RLS-gated.
  // Resolve the record id: from a live session carrying the legacy id, else from
  // a group lesson carrying it (covers a fully-dissolved group whose sessions are
  // gone but whose lesson still points at the durable record), else the legacy id
  // itself (groups the backfill identity-mapped so session_groups.id == group_id).
  let groupRecordId = groupId;
  const { data: sessRef } = await supabase
    .from('schedule_sessions')
    .select('group_ref')
    .eq('group_id', groupId)
    .not('group_ref', 'is', null)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (sessRef?.group_ref) {
    groupRecordId = sessRef.group_ref;
  } else {
    const { data: lessonRef } = await supabase
      .from('lessons')
      .select('group_ref')
      .eq('group_id', groupId)
      .not('group_ref', 'is', null)
      .limit(1)
      .maybeSingle();
    if (lessonRef?.group_ref) groupRecordId = lessonRef.group_ref;
  }

  const { data: groupRecord } = await supabase
    .from('session_groups')
    .select('id')
    .eq('id', groupRecordId)
    .maybeSingle();
  if (groupRecord) return true;

  // Path B — legacy live membership (bake-window fallback; removed in Phase 5).
  const { data: legacy } = await supabase
    .from('schedule_sessions')
    .select('id')
    .eq('group_id', groupId)
    .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
    .limit(1);
  return !!(legacy && legacy.length > 0);
}
