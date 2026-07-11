/**
 * Hold events on the organizer's Google Calendar (SPE-218, spec §2.1).
 *
 * Reserved IEP meetings are internal holds: an event on the ORGANIZER's own
 * calendar only, initials-only title, no attendees — team/family invitations
 * belong to the confirmation pass (SPE-209/210). Everything here is
 * best-effort: reserving and cancelling meetings in Speddy never depends on
 * Google succeeding.
 *
 * POST { action: 'create', meetingIds: string[] }   (≤ MAX_MEETINGS_PER_CALL;
 *   the client chunks larger batches)
 *   → creates events for the caller's reserved meetings that lack one,
 *     storing iep_meetings.google_event_id.
 * POST { action: 'cancel', meetingId: string }
 *   → deletes the hold event (already-gone counts as success) and clears
 *     google_event_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  deleteCalendarEvent,
  insertCalendarEvent,
} from '@/lib/calendar/google-calendar-api';
import {
  getCalendarAccessTokenOrResponse,
  parseJsonObjectBody,
} from '@/lib/calendar/route-helpers';
import { MAX_MEETINGS_PER_CALL } from '@/lib/calendar/hold-events-client';

export const dynamic = 'force-dynamic';
// Up to 50 Google inserts per call: without this, the platform's default
// function duration can kill the loop mid-batch on a slow Google day.
export const maxDuration = 60;
/** Modest write concurrency: fast batches without hammering one calendar. */
const INSERT_CONCURRENCY = 4;

type HoldOutcome = 'created' | 'failed' | 'skipped';

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

  if (body.action === 'create') {
    const meetingIds = Array.isArray(body.meetingIds)
      ? body.meetingIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (meetingIds.length === 0) {
      return NextResponse.json({ connected: true, created: 0, failed: 0 });
    }
    if (meetingIds.length > MAX_MEETINGS_PER_CALL) {
      // Explicit failure beats silently dropping the tail of a batch.
      return NextResponse.json(
        { error: `Too many meetings per call (max ${MAX_MEETINGS_PER_CALL})` },
        { status: 400 }
      );
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
    if (!meetings || meetings.length === 0) {
      return NextResponse.json({ connected: true, created: 0, failed: 0 });
    }

    const token = await getCalendarAccessTokenOrResponse(
      supabase,
      user.id,
      'Calendar sync unavailable'
    );
    if (token.response) return token.response;
    const accessToken = token.accessToken;

    const processMeeting = async (
      meeting: (typeof meetings)[number]
    ): Promise<HoldOutcome> => {
      if (!meeting.scheduled_start || !meeting.scheduled_end) return 'skipped';
      const studentsRel = meeting.students as unknown as
        | { initials: string }
        | { initials: string }[]
        | null;
      const student = Array.isArray(studentsRel) ? studentsRel[0] : studentsRel;

      let eventId: string;
      try {
        eventId = await insertCalendarEvent({
          accessToken,
          summary: `IEP — ${student?.initials ?? 'student'} (hold)`,
          description:
            'Reserved via Speddy — internal hold; team and family confirmation to follow.',
          location: meeting.location ?? undefined,
          startIso: meeting.scheduled_start,
          endIso: meeting.scheduled_end,
        });
      } catch (err) {
        console.error(
          `Hold event for meeting ${meeting.id} failed:`,
          err instanceof Error ? err.message : 'unknown error'
        );
        return 'failed';
      }

      // Claim the row atomically: only if it is STILL reserved, unclaimed,
      // and not soft-deleted. A cancellation or a concurrent create since
      // the read above means the hold is unwanted — delete the fresh event
      // rather than orphaning it or stamping a row that moved on.
      const { data: claimed, error: updateError } = await supabase
        .from('iep_meetings')
        .update({ google_event_id: eventId })
        .eq('id', meeting.id)
        .eq('status', 'reserved')
        .is('google_event_id', null)
        .is('deleted_at', null)
        .select('id');
      if (updateError || !claimed?.length) {
        try {
          await deleteCalendarEvent({ accessToken, eventId });
        } catch (cleanupErr) {
          // The unwanted event survived — surface it, don't pretend clean.
          console.error(
            `Orphan hold cleanup for meeting ${meeting.id} failed (event ${eventId}):`,
            cleanupErr instanceof Error ? cleanupErr.message : 'unknown error'
          );
          return 'failed';
        }
        if (updateError) {
          console.error(
            `Hold claim for meeting ${meeting.id} failed:`,
            updateError
          );
          return 'failed';
        }
        return 'skipped'; // row no longer needs a hold; event cleaned up
      }
      return 'created';
    };

    let created = 0;
    let failed = 0;
    for (let i = 0; i < meetings.length; i += INSERT_CONCURRENCY) {
      const outcomes = await Promise.all(
        meetings.slice(i, i + INSERT_CONCURRENCY).map(processMeeting)
      );
      for (const outcome of outcomes) {
        if (outcome === 'created') created += 1;
        else if (outcome === 'failed') failed += 1;
      }
    }
    return NextResponse.json({ connected: true, created, failed });
  }

  if (body.action === 'cancel') {
    const meetingId = typeof body.meetingId === 'string' ? body.meetingId : '';
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
    }
    // Look the meeting up BEFORE acquiring a token: cancels for meetings
    // without a hold (pre-feature meetings, failed inserts, double-cancels)
    // are no-ops that shouldn't pay the token/refresh pipeline.
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
      return NextResponse.json({ removed: false });
    }

    const token = await getCalendarAccessTokenOrResponse(
      supabase,
      user.id,
      'Calendar sync unavailable'
    );
    if (token.response) return token.response;

    try {
      await deleteCalendarEvent({
        accessToken: token.accessToken,
        eventId: meeting.google_event_id,
      });
      const { error: clearError } = await supabase
        .from('iep_meetings')
        .update({ google_event_id: null })
        .eq('id', meeting.id);
      // A stale google_event_id misreports state — only claim removal once
      // the link is actually cleared.
      if (clearError) throw clearError;
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
