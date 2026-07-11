/**
 * Browser-side helpers turning Google free/busy intervals into the
 * availability engine's BusyBlock shape (SPE-218).
 *
 * The engine works in local calendar dates + minutes-from-midnight
 * (lib/iep-meetings/availability.ts); the rest of the app treats the
 * browser's local time as the school's time, so conversion happens here,
 * client-side, with plain Date math. Tokens never reach the browser — the
 * server route does the Google call and returns raw ISO intervals.
 */
import type { BusyBlock } from '@/lib/iep-meetings/availability';
import { formatDateLocal } from '@/lib/utils/date-helpers';
import type { IsoInterval } from './google-calendar-api';

// Single wire-contract type shared with the server-side API client
// (type-only import — erased at build, no server code in the bundle).
export type { IsoInterval } from './google-calendar-api';

const GOOGLE_BUSY_LABEL = 'Google Calendar';
/** Client-side ceiling; the server's own per-request timeouts sit below it. */
const FETCH_TIMEOUT_MS = 30_000;

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Convert ISO busy intervals to date-specific BusyBlocks in local time,
 * splitting intervals that cross midnight into one block per calendar date.
 * Zero-length results are dropped.
 */
export function isoIntervalsToBusyBlocks(intervals: IsoInterval[]): BusyBlock[] {
  const blocks: BusyBlock[] = [];
  for (const interval of intervals) {
    const startMs = Date.parse(interval.start);
    const endMs = Date.parse(interval.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }
    let cursor = new Date(startMs);
    const end = new Date(endMs);
    while (cursor < end) {
      const dayEnd = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
        0,
        0,
        0,
        0
      );
      const segmentEnd = end < dayEnd ? end : dayEnd;
      const startMinutes = minutesIntoDay(cursor);
      const endMinutes =
        segmentEnd.getTime() === dayEnd.getTime()
          ? 24 * 60
          : minutesIntoDay(segmentEnd);
      if (endMinutes > startMinutes) {
        blocks.push({
          date: formatDateLocal(cursor),
          start_minutes: startMinutes,
          end_minutes: endMinutes,
          source: 'google',
          label: GOOGLE_BUSY_LABEL,
        });
      }
      cursor = dayEnd;
    }
  }
  return blocks;
}

/** Local midnight of a 'YYYY-MM-DD' date as an ISO instant. */
export function localDateToIso(date: string, plusDays = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays, 0, 0, 0, 0).toISOString();
}

export interface GoogleBusyResult {
  connected: boolean;
  /** Key 'primary' = the connected user; other keys = requested emails. */
  busyByCalendar: Map<string, BusyBlock[]>;
}

/**
 * Fetch Google busy blocks for the signed-in user's calendar plus optional
 * colleague emails over an inclusive local-date range. Never throws for
 * "no/broken connection" — that's a normal planner state ({connected:false});
 * network/server failures do throw so callers can distinguish degraded runs.
 */
export async function fetchGoogleBusyBlocks(params: {
  from: string; // 'YYYY-MM-DD' inclusive
  to: string; // 'YYYY-MM-DD' inclusive
  emails?: string[];
}): Promise<GoogleBusyResult> {
  // Guard before date math: an empty or malformed date would otherwise
  // become an Invalid Date whose toISOString() throws a RangeError.
  if (
    !LOCAL_DATE_RE.test(params.from) ||
    !LOCAL_DATE_RE.test(params.to) ||
    params.to < params.from
  ) {
    throw new Error('fetchGoogleBusyBlocks: invalid local date range');
  }
  const res = await fetch('/api/calendar/google/freebusy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: localDateToIso(params.from),
      timeMax: localDateToIso(params.to, 1),
      emails: params.emails ?? [],
    }),
    // A hung request must not pin the planner's drafting spinner forever.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Google availability request failed (${res.status})`);
  }
  const body = await res.json();
  if (!body?.connected) {
    return { connected: false, busyByCalendar: new Map() };
  }
  const busyByCalendar = new Map<string, BusyBlock[]>();
  for (const [id, intervals] of Object.entries(body.calendars ?? {})) {
    busyByCalendar.set(
      id,
      isoIntervalsToBusyBlocks(intervals as IsoInterval[])
    );
  }
  return { connected: true, busyByCalendar };
}
