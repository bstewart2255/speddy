import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface AttendanceRecord {
  student_id: string;
  present: boolean;
  absence_reason?: string | null;
}

interface AttendancePayload {
  session_date: string;
  attendance: AttendanceRecord[];
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ sessionId: string }> }
) {
  const params = await props.params;
  const { sessionId } = params;

  const searchParams = request.nextUrl.searchParams;
  const sessionDate = searchParams.get('session_date');

  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (sessionId.startsWith('temp-')) {
      return NextResponse.json({ attendance: [] });
    }

    if (!sessionDate) {
      return NextResponse.json({ error: 'session_date query parameter is required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    const { data: session, error: sessionError } = await serviceClient
      .from('schedule_sessions')
      .select('id, provider_id, assigned_to_specialist_id, assigned_to_sea_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const hasAccess = session.provider_id === user.id ||
      session.assigned_to_specialist_id === user.id ||
      session.assigned_to_sea_id === user.id;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: attendance, error: attendanceError } = await serviceClient
      .from('attendance')
      .select('id, student_id, present, absence_reason, marked_by, created_at, updated_at')
      .eq('session_id', sessionId)
      .eq('session_date', sessionDate);

    if (attendanceError) {
      console.error('Error fetching attendance:', attendanceError);
      return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }

    return NextResponse.json({ attendance: attendance || [] });
  } catch (error) {
    console.error('Error in attendance GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ sessionId: string }> }
) {
  const params = await props.params;
  const { sessionId } = params;

  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (sessionId.startsWith('temp-')) {
      return NextResponse.json({ error: 'Cannot save attendance for temporary sessions' }, { status: 400 });
    }

    const body: AttendancePayload = await request.json();
    const { session_date, attendance } = body;

    if (!session_date) {
      return NextResponse.json({ error: 'session_date is required' }, { status: 400 });
    }

    if (!attendance || !Array.isArray(attendance)) {
      return NextResponse.json({ error: 'attendance array is required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    const { data: session, error: sessionError } = await serviceClient
      .from('schedule_sessions')
      .select('id, provider_id, assigned_to_specialist_id, assigned_to_sea_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const hasAccess = session.provider_id === user.id ||
      session.assigned_to_specialist_id === user.id ||
      session.assigned_to_sea_id === user.id;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const upsertRecords = attendance.map(record => ({
      session_id: sessionId,
      student_id: record.student_id,
      session_date: session_date,
      present: record.present,
      absence_reason: record.present ? null : (record.absence_reason || null),
      marked_by: user.id
    }));

    const { data: savedAttendance, error: upsertError } = await serviceClient
      .from('attendance')
      .upsert(upsertRecords, {
        onConflict: 'session_id,student_id,session_date'
      })
      .select();

    if (upsertError) {
      console.error('Error saving attendance:', upsertError);
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      attendance: savedAttendance,
      message: 'Attendance saved successfully'
    });
  } catch (error) {
    console.error('Error in attendance POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
