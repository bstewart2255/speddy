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

// POST - Get indicators for sessions and groups (has notes, has documents)
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { sessions, groupIds, weekDates } = body as {
      sessions?: SessionInfo[];
      groupIds?: string[];
      weekDates?: string[];  // All dates in the week (for group filtering)
    };

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
