/**
 * Google free/busy for the planner (SPE-218): queries with the SIGNED-IN
 * user's token — their own calendar plus colleague calendars already visible
 * to them under Google's sharing rules (spec §5, organizer-centric).
 *
 * "Not connected" is a normal response ({connected:false}), not an error:
 * the planner degrades to internal sources. Google's per-request caps (time
 * span, calendars per request) are handled inside freeBusyQuery — nothing
 * is silently truncated here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { freeBusyQuery } from '@/lib/calendar/google-calendar-api';
import {
  getCalendarAccessTokenOrResponse,
  parseJsonObjectBody,
} from '@/lib/calendar/route-helpers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Request-size guard only — real Google caps are batched in freeBusyQuery. */
const MAX_EMAILS = 100;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await parseJsonObjectBody(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const timeMin = typeof body.timeMin === 'string' ? body.timeMin : '';
  const timeMax = typeof body.timeMax === 'string' ? body.timeMax : '';
  if (
    !Number.isFinite(Date.parse(timeMin)) ||
    !Number.isFinite(Date.parse(timeMax)) ||
    Date.parse(timeMax) <= Date.parse(timeMin)
  ) {
    return NextResponse.json(
      { error: 'timeMin/timeMax must be a valid, ordered ISO range' },
      { status: 400 }
    );
  }

  const emails = Array.isArray(body.emails)
    ? body.emails.filter(
        (e): e is string => typeof e === 'string' && e.includes('@')
      )
    : [];
  if (emails.length > MAX_EMAILS) {
    // Explicit failure beats silently planning without someone's calendar.
    return NextResponse.json(
      { error: `Too many calendars requested (max ${MAX_EMAILS})` },
      { status: 400 }
    );
  }

  const token = await getCalendarAccessTokenOrResponse(
    supabase,
    user.id,
    'Calendar availability unavailable'
  );
  if (token.response) return token.response;

  try {
    const { busyByCalendar, incomplete } = await freeBusyQuery({
      accessToken: token.accessToken,
      timeMin,
      timeMax,
      calendarIds: ['primary', ...emails],
    });
    return NextResponse.json({ connected: true, calendars: busyByCalendar, incomplete });
  } catch (err) {
    console.error(
      'Free/busy query failed:',
      err instanceof Error ? err.message : 'unknown error'
    );
    return NextResponse.json(
      { error: 'Calendar availability unavailable' },
      { status: 502 }
    );
  }
}
