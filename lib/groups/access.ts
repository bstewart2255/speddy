import type { createClient } from '@/lib/supabase/server';

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** Canonical 8-4-4-4-12 UUID. */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `id` is a canonical UUID — guard before interpolating into a
 *  PostgREST `.or()` filter string (see `groupRefOrLegacyFilter`). */
export function isCanonicalUuid(id: string): boolean {
  return CANONICAL_UUID.test(id);
}

/**
 * PostgREST `.or()` filter matching a group's content by its durable `group_ref`
 * OR its legacy `group_id`. Group content (lessons) rekeys to `group_ref` in
 * Phase 4; the legacy leg keeps any not-yet-linked row visible during the
 * dual-write bake (Phase 1b linked all known rows, so this is belt-and-suspenders
 * — dropped with the legacy column in Phase 5).
 *
 * `groupId` MUST be a validated UUID (call `isCanonicalUuid` first) — it is
 * interpolated verbatim into the filter string, so an unvalidated value would be
 * a filter-injection vector.
 */
export function groupRefOrLegacyFilter(groupId: string): string {
  return `group_ref.eq.${groupId},group_id.eq.${groupId}`;
}

/**
 * Resolve the durable session_groups id for a legacy group_id: from a live
 * session carrying the legacy id, else from a group lesson carrying it (covers a
 * fully-dissolved group whose sessions are gone but whose lesson still points at
 * the durable record). Returns null when no durable ref is found (the caller then
 * falls back to the legacy id, which equals the record id for backfilled,
 * identity-mapped groups). Shared so the lesson route and access check resolve it
 * identically.
 */
export async function resolveGroupRef(
  supabase: SupabaseServer,
  groupId: string
): Promise<string | null> {
  const { data: sessRef } = await supabase
    .from('schedule_sessions')
    .select('group_ref')
    .eq('group_id', groupId)
    .not('group_ref', 'is', null)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (sessRef?.group_ref) return sessRef.group_ref;

  const { data: lessonRef } = await supabase
    .from('lessons')
    .select('group_ref')
    .eq('group_id', groupId)
    .not('group_ref', 'is', null)
    .limit(1)
    .maybeSingle();
  return lessonRef?.group_ref ?? null;
}

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
  // Path A — durable group record (owner or current assignee), RLS-gated. The
  // record id is the resolved group_ref, else the legacy id itself (backfilled
  // groups are identity-mapped so session_groups.id == group_id).
  const groupRecordId = (await resolveGroupRef(supabase, groupId)) ?? groupId;

  const { data: groupRecord } = await supabase
    .from('session_groups')
    .select('id')
    .eq('id', groupRecordId)
    .maybeSingle();
  if (groupRecord) return true;

  // Path B — legacy live membership (bake-window fallback; removed in Phase 5).
  // Excludes soft-deleted rows so a since-deleted membership can't grant access.
  const { data: legacy } = await supabase
    .from('schedule_sessions')
    .select('id')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
    .limit(1);
  return !!(legacy && legacy.length > 0);
}
