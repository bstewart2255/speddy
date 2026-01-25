import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function formatTime12hr(time: string | null): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ studentId: string }> }
) {
  const params = await props.params;
  const { studentId } = params;

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

  try {
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
  } catch (error) {
    console.error('Error fetching student attendance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
