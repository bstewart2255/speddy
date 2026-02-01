import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { withAuth } from '@/lib/api/with-auth';

interface IndicatorResult {
  hasNotes: boolean;
  hasDocuments: boolean;
  hasAttendance?: boolean;
  allPresent?: boolean;
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

    // Fetch notes indicators
    // For individual sessions: check schedule_sessions.session_notes (per-session storage)
    // For groups: check lessons table (shared notes)

    if (sessions && sessions.length > 0) {
      // Get unique dates for queries
      const uniqueDates = [...new Set(sessions.map(s => s.sessionDate))];

      // Get session IDs for lookups
      const sessionIds = sessions.map(s => s.id);

      // Fetch sessions with notes directly from schedule_sessions table
      // This is the correct per-session storage location
      const { data: sessionsWithNotes } = await supabase
        .from('schedule_sessions')
        .select('id, session_date')
        .in('id', sessionIds)
        .not('session_notes', 'is', null)
        .neq('session_notes', '');

      // Build a set of "sessionId|sessionDate" keys that have notes
      const sessionNotesSet = new Set(
        sessionsWithNotes?.map(s => `${s.id}|${s.session_date}`) || []
      );

      // Fetch documents for individual sessions, including session_date for filtering
      const { data: sessionDocs } = await supabase
        .from('documents')
        .select('documentable_id, session_date')
        .eq('documentable_type', 'session')
        .in('documentable_id', sessionIds);

      // Build a set of "sessionId|sessionDate" keys that have documents
      const sessionDocsWithDate = new Set(
        sessionDocs?.map(d => `${d.documentable_id}|${d.session_date || ''}`) || []
      );

      // Fetch attendance records for sessions
      const { data: sessionAttendance } = await supabase
        .from('attendance')
        .select('session_id, session_date, present')
        .in('session_id', sessionIds)
        .in('session_date', uniqueDates);

      // Build a map of "sessionId|sessionDate" -> { hasAttendance, allPresent }
      const attendanceBySessionDate = new Map<string, { hasAttendance: boolean; allPresent: boolean }>();
      if (sessionAttendance) {
        for (const record of sessionAttendance) {
          const key = `${record.session_id}|${record.session_date}`;
          const existing = attendanceBySessionDate.get(key);
          if (existing) {
            existing.allPresent = existing.allPresent && record.present;
          } else {
            attendanceBySessionDate.set(key, { hasAttendance: true, allPresent: record.present });
          }
        }
      }

      // Build indicator map for sessions
      // Key by sessionId|sessionDate to properly isolate recurring instances
      for (const session of sessions) {
        const sessionKey = `${session.id}|${session.sessionDate}`;
        const attendanceInfo = attendanceBySessionDate.get(sessionKey);
        sessionIndicators[sessionKey] = {
          hasNotes: sessionNotesSet.has(sessionKey),
          hasDocuments: sessionDocsWithDate.has(sessionKey),
          hasAttendance: attendanceInfo?.hasAttendance || false,
          allPresent: attendanceInfo?.allPresent
        };
      }
    }

    if (groupIds && groupIds.length > 0 && weekDates && weekDates.length > 0) {
      // Fetch lessons with notes for these groups within the week dates
      const { data: groupsWithNotes } = await supabase
        .from('lessons')
        .select('group_id, lesson_date')
        .in('group_id', groupIds)
        .in('lesson_date', weekDates)
        .not('notes', 'is', null)
        .neq('notes', '');

      // Build a set of "groupId|lessonDate" keys that have notes
      const groupNotesWithDate = new Set(
        groupsWithNotes?.map(l => `${l.group_id}|${l.lesson_date}`) || []
      );

      // Fetch documents for groups, including session_date for filtering
      const { data: groupDocs } = await supabase
        .from('documents')
        .select('documentable_id, session_date')
        .eq('documentable_type', 'group')
        .in('documentable_id', groupIds)
        .in('session_date', weekDates);

      // Build a set of "groupId|sessionDate" keys that have documents
      const groupDocsWithDate = new Set(
        groupDocs?.map(d => `${d.documentable_id}|${d.session_date || ''}`) || []
      );

      // Fetch sessions for these groups to get their IDs for attendance lookup
      const { data: groupSessions } = await supabase
        .from('schedule_sessions')
        .select('id, group_id, session_date')
        .in('group_id', groupIds)
        .in('session_date', weekDates);

      // Get session IDs for attendance lookup
      const groupSessionIds = groupSessions?.map(s => s.id) || [];

      // Fetch attendance for group sessions
      const { data: groupAttendance } = groupSessionIds.length > 0 ? await supabase
        .from('attendance')
        .select('session_id, session_date, present')
        .in('session_id', groupSessionIds)
        .in('session_date', weekDates) : { data: null };

      // Build a map of "groupId|sessionDate" -> { hasAttendance, allPresent }
      const groupAttendanceByDate = new Map<string, { hasAttendance: boolean; allPresent: boolean }>();
      if (groupAttendance && groupSessions) {
        // Create a map from session_id to group_id
        const sessionToGroup = new Map(groupSessions.map(s => [s.id, s.group_id]));

        for (const record of groupAttendance) {
          const groupId = sessionToGroup.get(record.session_id);
          if (groupId) {
            const key = `${groupId}|${record.session_date}`;
            const existing = groupAttendanceByDate.get(key);
            if (existing) {
              existing.allPresent = existing.allPresent && record.present;
            } else {
              groupAttendanceByDate.set(key, { hasAttendance: true, allPresent: record.present });
            }
          }
        }
      }

      // Build indicator map for groups - keyed by "groupId|date" for per-instance checking
      for (const groupId of groupIds) {
        for (const date of weekDates) {
          const key = `${groupId}|${date}`;
          const attendanceInfo = groupAttendanceByDate.get(key);
          groupIndicators[key] = {
            hasNotes: groupNotesWithDate.has(key),
            hasDocuments: groupDocsWithDate.has(key),
            hasAttendance: attendanceInfo?.hasAttendance || false,
            allPresent: attendanceInfo?.allPresent
          };
        }
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
