/**
 * Google free/busy for the planner (SPE-218): queries with the SIGNED-IN
 * user's token — their own calendar plus colleague calendars already visible
 * to them under Google's sharing rules (spec §5, organizer-centric).
 *
 * "Not connected" is a normal response ({connected:false}), not an error:
 * the planner degrades to internal sources.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  CalendarReconnectRequiredError,
  getValidGoogleAccessToken,
} from '@/lib/calendar/connections';
import { freeBusyQuery } from '@/lib/calendar/google-calendar-api';

export const dynamic = 'force-dynamic';

const MAX_EMAILS = 25;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { timeMin?: string; timeMax?: string; emails?: unknown };
  try {
    body = await request.json();
  } catch {
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
    ? body.emails
        .filter((e): e is string => typeof e === 'string' && e.includes('@'))
        .slice(0, MAX_EMAILS)
    : [];

  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken(supabase, user.id);
  } catch (err) {
    if (err instanceof CalendarReconnectRequiredError) {
      return NextResponse.json({ connected: false });
    }
    console.error(
      'Free/busy token lookup failed:',
      err instanceof Error ? err.message : 'unknown error'
    );
    return NextResponse.json(
      { error: 'Calendar availability unavailable' },
      { status: 502 }
    );
  }

  try {
    const calendars = await freeBusyQuery({
      accessToken,
      timeMin,
      timeMax,
      calendarIds: ['primary', ...emails],
    });
    return NextResponse.json({ connected: true, calendars });
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
