/**
 * Google Calendar REST calls for the IEP scheduler (SPE-218). Server-only:
 * callers obtain an access token via getValidGoogleAccessToken().
 *
 * Same posture as google-oauth.ts: plain fetch (no googleapis dependency),
 * short timeouts, GoogleOAuthError shapes, and never any token material in
 * errors or logs.
 */
import { GoogleOAuthError } from './google-oauth';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const REQUEST_TIMEOUT_MS = 10_000;

/** Google caps freeBusy query spans; stay comfortably under it per request. */
const FREEBUSY_MAX_DAYS_PER_REQUEST = 42;
/**
 * Planning horizons are within a school year; hard-cap runaway ranges.
 * Callers bound their range to what the planner actually consults (latest
 * due date), so this cap is a backstop, not an expected path.
 */
const FREEBUSY_MAX_TOTAL_DAYS = 370;
/** Google limits calendars per freeBusy request; batch and merge. */
const FREEBUSY_MAX_CALENDARS_PER_REQUEST = 20;

async function calendarRequest(
  accessToken: string,
  path: string,
  init: { method: string; body?: unknown }
): Promise<Response> {
  try {
    return await fetch(`${CALENDAR_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleOAuthError(
      'Google Calendar API unreachable or timed out',
      'network_error'
    );
  }
}

async function raiseForStatus(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  let code = 'calendar_api_error';
  let message = `Google Calendar ${what} failed`;
  try {
    const body = await res.json();
    if (body?.error?.status) code = String(body.error.status);
    if (body?.error?.message) message = String(body.error.message);
  } catch {
    // keep generic message
  }
  throw new GoogleOAuthError(message, code, res.status);
}

export interface IsoInterval {
  start: string; // RFC3339
  end: string; // RFC3339
}

/**
 * Split [timeMin, timeMax) into consecutive sub-ranges no longer than
 * Google's per-request span limit. Exported for tests.
 */
export function chunkTimeRange(
  timeMin: string,
  timeMax: string
): { timeMin: string; timeMax: string }[] {
  const startMs = Date.parse(timeMin);
  const endMs = Date.parse(timeMax);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }
  const cappedEndMs = Math.min(
    endMs,
    startMs + FREEBUSY_MAX_TOTAL_DAYS * 24 * 60 * 60 * 1000
  );
  const stepMs = FREEBUSY_MAX_DAYS_PER_REQUEST * 24 * 60 * 60 * 1000;
  const chunks: { timeMin: string; timeMax: string }[] = [];
  for (let cursor = startMs; cursor < cappedEndMs; cursor += stepMs) {
    chunks.push({
      timeMin: new Date(cursor).toISOString(),
      timeMax: new Date(Math.min(cursor + stepMs, cappedEndMs)).toISOString(),
    });
  }
  return chunks;
}

function chunkList<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * freebusy.query over an arbitrary range and calendar count, for the user's
 * own calendar ('primary') plus any other calendar ids (colleague emails).
 * Both Google caps are handled here — the time span (chunked windows) and
 * the calendars-per-request limit (batched ids) — so callers never silently
 * lose coverage. Independent read-only requests run in parallel. Calendars
 * the token can't see come back with per-calendar errors from Google —
 * those are skipped, contributing no busy data, by design (spec §5:
 * sources are additive, never required).
 */
export async function freeBusyQuery(params: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
  calendarIds: string[];
}): Promise<Record<string, IsoInterval[]>> {
  const busyByCalendar: Record<string, IsoInterval[]> = {};
  for (const id of params.calendarIds) busyByCalendar[id] = [];

  const idBatches = chunkList(
    params.calendarIds,
    FREEBUSY_MAX_CALENDARS_PER_REQUEST
  );
  const requests: { chunk: { timeMin: string; timeMax: string }; ids: string[] }[] =
    [];
  for (const chunk of chunkTimeRange(params.timeMin, params.timeMax)) {
    for (const ids of idBatches) {
      requests.push({ chunk, ids });
    }
  }

  await Promise.all(
    requests.map(async ({ chunk, ids }) => {
      const res = await calendarRequest(params.accessToken, '/freeBusy', {
        method: 'POST',
        body: {
          timeMin: chunk.timeMin,
          timeMax: chunk.timeMax,
          items: ids.map(id => ({ id })),
        },
      });
      await raiseForStatus(res, 'free/busy query');
      const body = await res.json();
      const calendars = body?.calendars ?? {};
      for (const id of ids) {
        const entry = calendars[id];
        if (!entry || Array.isArray(entry.errors)) continue; // not visible — skip
        for (const interval of entry.busy ?? []) {
          if (interval?.start && interval?.end) {
            busyByCalendar[id].push({
              start: interval.start,
              end: interval.end,
            });
          }
        }
      }
    })
  );
  return busyByCalendar;
}

/** Create an event on the user's primary calendar; returns the event id. */
export async function insertCalendarEvent(params: {
  accessToken: string;
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
}): Promise<string> {
  const res = await calendarRequest(params.accessToken, '/calendars/primary/events', {
    method: 'POST',
    body: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: { dateTime: params.startIso },
      end: { dateTime: params.endIso },
      // Internal hold: no attendees yet — the confirmation pass (SPE-209/210)
      // owns invitations.
      reminders: { useDefault: true },
    },
  });
  await raiseForStatus(res, 'event creation');
  const body = await res.json();
  if (!body?.id) {
    throw new GoogleOAuthError(
      'Google Calendar event creation returned no id',
      'calendar_api_error'
    );
  }
  return body.id as string;
}

/**
 * Delete an event from the user's primary calendar. Already-gone events
 * (404/410) count as success — the goal state is "no event".
 */
export async function deleteCalendarEvent(params: {
  accessToken: string;
  eventId: string;
}): Promise<void> {
  const res = await calendarRequest(
    params.accessToken,
    `/calendars/primary/events/${encodeURIComponent(params.eventId)}`,
    { method: 'DELETE' }
  );
  if (res.status === 404 || res.status === 410) return;
  await raiseForStatus(res, 'event deletion');
}
