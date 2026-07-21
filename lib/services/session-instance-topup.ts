import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types';

// Rolling materialization horizon (SPE-291). Every active scheduled template
// keeps dated instances covering the next N weeks; the calendar's virtual
// layer renders anything beyond. With a daily trigger, a failed run leaves
// ~11 weeks of slack before anyone could notice.
export const SESSION_TOPUP_WEEKS_AHEAD = 12;

export type SessionTopupResult =
  | { success: true; templatesProcessed: number; instancesCreated: number }
  | { success: false; error: string };

/**
 * Extends every active scheduled template's dated instances to the rolling
 * horizon via the set-based `topup_session_instances` Postgres function
 * (idempotent: ON CONFLICT DO NOTHING). Must be called with the service-role
 * client — the function spans all providers and is not granted to
 * authenticated users.
 *
 * `templatesProcessed` counts templates ELIGIBLE for top-up, not templates
 * that received rows — after a full run, (616, 0) is the healthy steady state.
 */
export async function runSessionInstanceTopup(
  supabase: SupabaseClient<Database>
): Promise<SessionTopupResult> {
  const { data, error } = await supabase.rpc('topup_session_instances', {
    p_weeks_ahead: SESSION_TOPUP_WEEKS_AHEAD
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    success: true,
    templatesProcessed: Number(row?.templates_processed ?? 0),
    instancesCreated: Number(row?.instances_created ?? 0)
  };
}
