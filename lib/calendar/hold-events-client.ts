/**
 * Browser-side sync calls for Google Calendar hold events (SPE-218).
 *
 * These are invoked from inside the reserve/cancel query operations — not by
 * pages — so no future caller can forget them: a forgotten cancel-sync
 * leaves a phantom hold that flows back through the free/busy source and
 * silently poisons every later planning run. Both calls are best-effort and
 * must never block the primary flow.
 */

/** Server-enforced per-call cap; larger batches are chunked here. */
export const MAX_MEETINGS_PER_CALL = 50;

/**
 * Create hold events for freshly reserved meetings. Resolves to the number
 * of holds created; resolves (never rejects) with a partial count when a
 * batch fails — callers only use it for the success banner.
 */
export async function syncHoldEvents(meetingIds: string[]): Promise<number> {
  let created = 0;
  for (let i = 0; i < meetingIds.length; i += MAX_MEETINGS_PER_CALL) {
    const batch = meetingIds.slice(i, i + MAX_MEETINGS_PER_CALL);
    try {
      const res = await fetch('/api/calendar/google/meeting-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', meetingIds: batch }),
      });
      const sync = res.ok ? await res.json().catch(() => null) : null;
      if (sync?.connected && typeof sync.created === 'number') {
        created += sync.created;
      }
    } catch (err) {
      console.error('Calendar hold sync failed:', err);
    }
  }
  return created;
}

/** Fire-and-forget removal of a cancelled meeting's hold event. */
export function removeHoldEvent(meetingId: string): void {
  void fetch('/api/calendar/google/meeting-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', meetingId }),
  }).catch(err => console.error('Hold removal failed:', err));
}
