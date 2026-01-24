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

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  try {
    const { data: sessions, error: sessionsError } = await supabase
      .from('schedule_sessions')
      .select(`
        id,
        session_date,
        start_time,
        end_time,
        student_id
      `)
      .or(`provider_id.eq.${user.id},assigned_to_specialist_id.eq.${user.id},assigned_to_sea_id.eq.${user.id}`)
      .eq('is_template', false)
      .gte('session_date', startDate)
      .lte('session_date', endDate);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    const sessionIds = sessions?.map(s => s.id) || [];

    let attendanceRecords: any[] = [];
    if (sessionIds.length > 0) {
      const { data: attendance, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          *,
          students (
            id,
            first_name,
            last_name
          )
        `)
        .in('session_id', sessionIds)
        .gte('session_date', startDate)
        .lte('session_date', endDate);

      if (attendanceError) {
        console.error('Error fetching attendance:', attendanceError);
      } else {
        attendanceRecords = attendance || [];
      }
    }

    const attendanceMap = new Map<string, typeof attendanceRecords[0]>();
    for (const record of attendanceRecords) {
      const key = `${record.session_id}|${record.session_date}|${record.student_id}`;
      attendanceMap.set(key, record);
    }

    let presentCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;
    const absences: {
      studentName: string;
      studentInitials: string;
      date: string;
      reason: string | null;
      sessionTime: string;
    }[] = [];
    const unmarkedSessions: {
      sessionId: string;
      studentId: string;
      studentName: string;
      studentInitials: string;
      date: string;
      sessionTime: string;
    }[] = [];

    const sessionStudentIds = new Set<string>();
    for (const session of sessions || []) {
      if (session.student_id) {
        sessionStudentIds.add(session.student_id);
      }
    }

    let studentMap = new Map<string, { first_name: string; last_name: string }>();
    if (sessionStudentIds.size > 0) {
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .in('id', Array.from(sessionStudentIds));

      for (const student of students || []) {
        studentMap.set(student.id, student);
      }
    }

    for (const session of sessions || []) {
      if (!session.session_date || !session.student_id) continue;

      const key = `${session.id}|${session.session_date}|${session.student_id}`;
      const attendance = attendanceMap.get(key);
      const student = studentMap.get(session.student_id);

      if (!attendance) {
        unmarkedCount++;
        const firstName = student?.first_name || '';
        const lastName = student?.last_name || '';
        const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

        unmarkedSessions.push({
          sessionId: session.id,
          studentId: session.student_id,
          studentName: `${firstName} ${lastName}`.trim() || 'Unknown',
          studentInitials: initials || '?',
          date: session.session_date,
          sessionTime: `${formatTime12hr(session.start_time)} - ${formatTime12hr(session.end_time)}`
        });
      } else if (attendance.present === true) {
        presentCount++;
      } else if (attendance.present === false) {
        absentCount++;

        const firstName = student?.first_name || '';
        const lastName = student?.last_name || '';
        const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

        absences.push({
          studentName: `${firstName} ${lastName}`.trim() || 'Unknown',
          studentInitials: initials || '?',
          date: session.session_date,
          reason: attendance.absence_reason,
          sessionTime: `${formatTime12hr(session.start_time)} - ${formatTime12hr(session.end_time)}`
        });
      }
    }

    absences.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    unmarkedSessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({
      totalSessions: sessions?.length || 0,
      presentCount,
      absentCount,
      unmarkedCount,
      absences,
      unmarkedSessions
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
