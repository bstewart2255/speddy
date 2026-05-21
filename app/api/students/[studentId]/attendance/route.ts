import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';

function formatTime12hr(time: string | null): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

const querySchema = z.object({
  // Invalid/missing/out-of-range values fall back to 50 (matches prior behavior).
  limit: z.coerce.number().int().positive().max(500).catch(50),
});

export const GET = withRoute<{ studentId: string }, undefined, z.infer<typeof querySchema>>(
  { query: querySchema },
  async ({ query, params }) => {
    const { studentId } = params;
    const { limit } = query;

    const supabase = await createClient();

    // First, get summary counts from ALL records (not limited)
    const { data: allRecords, error: countError } = await supabase
      .from('attendance')
      .select('present')
      .eq('student_id', studentId);

    if (countError) {
      console.error('Error fetching attendance counts:', countError);
      return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }

    // Calculate summary stats from full dataset
    let presentCount = 0;
    let absentCount = 0;
    for (const record of allRecords || []) {
      if (record.present === true) {
        presentCount++;
      } else if (record.present === false) {
        absentCount++;
      }
    }

    // Now fetch limited records for display
    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from('attendance')
      .select(`
        id,
        session_id,
        session_date,
        present,
        absence_reason,
        created_at
      `)
      .eq('student_id', studentId)
      .order('session_date', { ascending: false })
      .limit(limit);

    if (attendanceError) {
      console.error('Error fetching attendance:', attendanceError);
      return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }

    // Get unique session IDs to fetch session details
    const sessionIds = [...new Set(attendanceRecords?.map(r => r.session_id) || [])];

    let sessionMap = new Map<string, { start_time: string | null; end_time: string | null }>();
    if (sessionIds.length > 0) {
      const { data: sessions, error: sessionsError } = await supabase
        .from('schedule_sessions')
        .select('id, start_time, end_time')
        .in('id', sessionIds);

      if (!sessionsError && sessions) {
        for (const session of sessions) {
          sessionMap.set(session.id, {
            start_time: session.start_time,
            end_time: session.end_time
          });
        }
      }
    }

    const records = (attendanceRecords || []).map(record => {
      const session = sessionMap.get(record.session_id);
      return {
        id: record.id,
        sessionId: record.session_id,
        date: record.session_date,
        present: record.present,
        absenceReason: record.absence_reason,
        sessionTime: session
          ? `${formatTime12hr(session.start_time)} - ${formatTime12hr(session.end_time)}`
          : ''
      };
    });

    const totalMarked = presentCount + absentCount;
    const attendanceRate = totalMarked > 0
      ? Math.round((presentCount / totalMarked) * 100)
      : 0;

    return NextResponse.json({
      summary: {
        presentCount,
        absentCount,
        totalMarked,
        attendanceRate
      },
      records
    });
  }
);
