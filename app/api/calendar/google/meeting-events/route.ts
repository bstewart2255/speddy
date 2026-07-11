/**
 * Hold events on the organizer's Google Calendar (SPE-218, spec §2.1).
 *
 * Reserved IEP meetings are internal holds: an event on the ORGANIZER's own
 * calendar only, initials-only title, no attendees — team/family invitations
 * belong to the confirmation pass (SPE-209/210). Everything here is
 * best-effort: reserving and cancelling meetings in Speddy never depends on
 * Google succeeding.
 *
 * POST { action: 'create', meetingIds: string[] }
 *   → creates events for the caller's reserved meetings that lack one,
 *     storing iep_meetings.google_event_id.
 * POST { action: 'cancel', meetingId: string }
 *   → deletes the hold event (already-gone counts as success) and clears
 *     google_event_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  CalendarReconnectRequiredError,
  getValidGoogleAccessToken,
} from '@/lib/calendar/connections';
import {
  deleteCalendarEvent,
  insertCalendarEvent,
} from '@/lib/calendar/google-calendar-api';

export const dynamic = 'force-dynamic';

const MAX_MEETINGS_PER_CALL = 50;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { action?: string; meetingIds?: unknown; meetingId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken(supabase, user.id);
  } catch (err) {
    if (err instanceof CalendarReconnectRequiredError) {
      // No connection is a normal state — nothing to sync.
      return NextResponse.json({ connected: false });
    }
    console.error(
      'Meeting-event token lookup failed:',
      err instanceof Error ? err.message : 'unknown error'
    );
    return NextResponse.json(
      { error: 'Calendar sync unavailable' },
      { status: 502 }
    );
  }

  if (body.action === 'create') {
    const meetingIds = Array.isArray(body.meetingIds)
      ? body.meetingIds
          .filter((id): id is string => typeof id === 'string')
          .slice(0, MAX_MEETINGS_PER_CALL)
      : [];
    if (meetingIds.length === 0) {
      return NextResponse.json({ connected: true, created: 0, failed: 0 });
    }

    // Organizer-scoped on top of RLS; only reserved meetings without an
    // event yet, so the call is idempotent across retries.
    const { data: meetings, error } = await supabase
      .from('iep_meetings')
      .select(
        'id, scheduled_start, scheduled_end, location, students(initials)'
      )
      .in('id', meetingIds)
      .eq('organizer_id', user.id)
      .eq('status', 'reserved')
      .is('google_event_id', null)
      .is('deleted_at', null);
    if (error) {
      console.error('Meeting-event fetch failed:', error);
      return NextResponse.json(
        { error: 'Failed to load meetings' },
        { status: 500 }
      );
    }

    let created = 0;
    let failed = 0;
    for (const meeting of meetings ?? []) {
      if (!meeting.scheduled_start || !meeting.scheduled_end) continue;
      const studentsRel = meeting.students as unknown as
        | { initials: string }
        | { initials: string }[]
        | null;
      const student = Array.isArray(studentsRel) ? studentsRel[0] : studentsRel;
      try {
        const eventId = await insertCalendarEvent({
          accessToken,
          summary: `IEP — ${student?.initials ?? 'student'} (hold)`,
          description:
            'Reserved via Speddy — internal hold; team and family confirmation to follow.',
          location: meeting.location ?? undefined,
          startIso: meeting.scheduled_start,
          endIso: meeting.scheduled_end,
        });
        // Claim the row atomically: only if it is STILL reserved and
        // unclaimed. A cancellation or a concurrent create since the read
        // above means the hold is unwanted — delete the fresh event rather
        // than orphaning it or stamping a row that moved on.
        const { data: claimed, error: updateError } = await supabase
          .from('iep_meetings')
          .update({ google_event_id: eventId })
          .eq('id', meeting.id)
          .eq('status', 'reserved')
          .is('google_event_id', null)
          .select('id');
        if (updateError || !claimed?.length) {
          await deleteCalendarEvent({ accessToken, eventId }).catch(() => {});
          if (updateError) throw updateError;
          continue; // row no longer needs a hold — neither created nor failed
        }
        created += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `Hold event for meeting ${meeting.id} failed:`,
          err instanceof Error ? err.message : 'unknown error'
        );
      }
    }
    return NextResponse.json({ connected: true, created, failed });
  }

  if (body.action === 'cancel') {
    const meetingId = typeof body.meetingId === 'string' ? body.meetingId : '';
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
    }
    const { data: meeting, error } = await supabase
      .from('iep_meetings')
      .select('id, google_event_id')
      .eq('id', meetingId)
      .eq('organizer_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Meeting lookup for event removal failed:', error);
      return NextResponse.json(
        { error: 'Failed to load meeting' },
        { status: 500 }
      );
    }
    if (!meeting?.google_event_id) {
      return NextResponse.json({ connected: true, removed: false });
    }
    try {
      await deleteCalendarEvent({
        accessToken,
        eventId: meeting.google_event_id,
      });
      await supabase
        .from('iep_meetings')
        .update({ google_event_id: null })
        .eq('id', meeting.id);
      return NextResponse.json({ connected: true, removed: true });
    } catch (err) {
      console.error(
        `Hold event removal for meeting ${meeting.id} failed:`,
        err instanceof Error ? err.message : 'unknown error'
      );
      return NextResponse.json({ connected: true, removed: false });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
