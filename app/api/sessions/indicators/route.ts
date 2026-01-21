import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { withAuth } from '@/lib/api/with-auth';

interface IndicatorResult {
  hasNotes: boolean;
  hasDocuments: boolean;
}

interface SessionInfo {
  id: string;
  timeSlot: string;  // Format: "HH:MM-HH:MM"
  sessionDate: string;  // Format: "YYYY-MM-DD"
}

// Input validation limits
const MAX_SESSIONS = 500;
const MAX_GROUPS = 100;
const MAX_DATES = 7;

function isValidSessionInfo(value: unknown): value is SessionInfo {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<SessionInfo>;
  return (
    typeof session.id === 'string' &&
    typeof session.timeSlot === 'string' &&
    typeof session.sessionDate === 'string'
  );
}

// POST - Get indicators for sessions and groups (has notes, has documents)
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const rawSessions = (body as Record<string, unknown>).sessions;
    const rawGroupIds = (body as Record<string, unknown>).groupIds;
    const rawWeekDates = (body as Record<string, unknown>).weekDates;

    // Validate sessions array
    if (rawSessions !== undefined && !Array.isArray(rawSessions)) {
      return NextResponse.json(
        { error: 'Invalid request: sessions must be an array' },
        { status: 400 }
      );
    }
    if (Array.isArray(rawSessions) && rawSessions.length > MAX_SESSIONS) {
      return NextResponse.json(
        { error: `Too many sessions (max ${MAX_SESSIONS})` },
        { status: 400 }
      );
    }
    if (Array.isArray(rawSessions) && !rawSessions.every(isValidSessionInfo)) {
      return NextResponse.json(
        { error: 'Invalid request: each session must have id, timeSlot, and sessionDate as strings' },
        { status: 400 }
      );
    }

    // Validate groupIds array
    if (rawGroupIds !== undefined && !Array.isArray(rawGroupIds)) {
      return NextResponse.json(
        { error: 'Invalid request: groupIds must be an array' },
        { status: 400 }
      );
    }
    if (Array.isArray(rawGroupIds) && rawGroupIds.length > MAX_GROUPS) {
      return NextResponse.json(
        { error: `Too many groups (max ${MAX_GROUPS})` },
        { status: 400 }
      );
    }
    if (Array.isArray(rawGroupIds) && !rawGroupIds.every(id => typeof id === 'string')) {
      return NextResponse.json(
        { error: 'Invalid request: each groupId must be a string' },
        { status: 400 }
      );
    }

    // Validate weekDates array
    if (rawWeekDates !== undefined && !Array.isArray(rawWeekDates)) {
      return NextResponse.json(
        { error: 'Invalid request: weekDates must be an array' },
        { status: 400 }
      );
    }
    if (Array.isArray(rawWeekDates) && rawWeekDates.length > MAX_DATES) {
      return NextResponse.json(
        { error: `Too many dates (max ${MAX_DATES})` },
        { status: 400 }
      );
    }
    if (Array.isArray(rawWeekDates) && !rawWeekDates.every(d => typeof d === 'string')) {
      return NextResponse.json(
        { error: 'Invalid request: each weekDate must be a string' },
        { status: 400 }
      );
    }

    // Cast validated inputs
    const sessions: SessionInfo[] = Array.isArray(rawSessions) ? rawSessions : [];
    const groupIds: string[] = Array.isArray(rawGroupIds) ? rawGroupIds : [];
    const weekDates: string[] = Array.isArray(rawWeekDates) ? rawWeekDates : [];

    log.info('Fetching session indicators', {
      userId,
      sessionCount: sessions?.length || 0,
      groupCount: groupIds?.length || 0,
      weekDatesCount: weekDates?.length || 0
    });

    const sessionIndicators: Record<string, IndicatorResult> = {};
    const groupIndicators: Record<string, IndicatorResult> = {};

    // Fetch notes indicators from lessons table
    // For individual sessions: match by provider_id + lesson_date + time_slot
    // For groups: match by group_id + lesson_date

    if (sessions && sessions.length > 0) {
      // Get unique dates and time slots
      const uniqueDates = [...new Set(sessions.map(s => s.sessionDate))];
      const timeSlots = [...new Set(sessions.map(s => s.timeSlot))];

      // Fetch all lessons with notes for these dates and time slots
      const { data: lessonsWithNotes } = await supabase
        .from('lessons')
        .select('time_slot, lesson_date')
        .eq('provider_id', userId)
        .in('lesson_date', uniqueDates)
        .in('time_slot', timeSlots)
        .not('notes', 'is', null)
        .neq('notes', '');

      // Build a set of "date|timeSlot" keys that have notes
      const dateTimeSlotWithNotes = new Set(
        lessonsWithNotes?.map(l => `${l.lesson_date}|${l.time_slot}`) || []
      );

      // Get session IDs for document lookup
      const sessionIds = sessions.map(s => s.id);

      // Fetch documents for individual sessions
      const { data: sessionDocs } = await supabase
        .from('documents')
        .select('documentable_id')
        .eq('documentable_type', 'session')
        .in('documentable_id', sessionIds);

      const sessionIdsWithDocs = new Set(sessionDocs?.map(d => d.documentable_id) || []);

      // Build indicator map for sessions
      for (const session of sessions) {
        const key = `${session.sessionDate}|${session.timeSlot}`;
        sessionIndicators[session.id] = {
          hasNotes: dateTimeSlotWithNotes.has(key),
          hasDocuments: sessionIdsWithDocs.has(session.id)
        };
      }
    }

    if (groupIds && groupIds.length > 0 && weekDates && weekDates.length > 0) {
      // Fetch lessons with notes for these groups within the week dates
      const { data: groupsWithNotes } = await supabase
        .from('lessons')
        .select('group_id')
        .in('group_id', groupIds)
        .in('lesson_date', weekDates)
        .not('notes', 'is', null)
        .neq('notes', '');

      const groupIdsWithNotes = new Set(groupsWithNotes?.map(l => l.group_id) || []);

      // Fetch documents for groups
      const { data: groupDocs } = await supabase
        .from('documents')
        .select('documentable_id')
        .eq('documentable_type', 'group')
        .in('documentable_id', groupIds);

      const groupIdsWithDocs = new Set(groupDocs?.map(d => d.documentable_id) || []);

      // Build indicator map for groups
      for (const groupId of groupIds) {
        groupIndicators[groupId] = {
          hasNotes: groupIdsWithNotes.has(groupId),
          hasDocuments: groupIdsWithDocs.has(groupId)
        };
      }
    }

    return NextResponse.json({
      sessionIndicators,
      groupIndicators
    });
  } catch (error) {
    log.error('Error fetching session indicators', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
