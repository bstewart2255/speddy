import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';

const getQuerySchema = z.object({
  session_date: z.string().optional(),
});

const attendanceRecordSchema = z
  .object({
    student_id: z.string(),
    present: z.boolean(),
    absence_reason: z.string().nullish(),
  })
  .passthrough();

const postSchema = z
  .object({
    session_date: z.string().min(1),
    attendance: z.array(attendanceRecordSchema),
  })
  .passthrough();

const putSchema = z
  .object({
    student_id: z.string().min(1),
    session_date: z.string().min(1),
    present: z.boolean(),
    absence_reason: z.string().nullish(),
  })
  .passthrough();

export const GET = withRoute<{ sessionId: string }, undefined, z.infer<typeof getQuerySchema>>(
  { query: getQuerySchema },
  async ({ userId, query, params }) => {
    const { sessionId } = params;
    const sessionDate = query.session_date;

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

    const hasAccess = session.provider_id === userId ||
      session.assigned_to_specialist_id === userId ||
      session.assigned_to_sea_id === userId;

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
  }
);

export const POST = withRoute<{ sessionId: string }, z.infer<typeof postSchema>>(
  { body: postSchema },
  async ({ userId, body, params }) => {
    const { sessionId } = params;

    if (sessionId.startsWith('temp-')) {
      return NextResponse.json({ error: 'Cannot save attendance for temporary sessions' }, { status: 400 });
    }

    const { session_date, attendance } = body;
    const serviceClient = createServiceClient();

    const { data: session, error: sessionError } = await serviceClient
      .from('schedule_sessions')
      .select('id, provider_id, assigned_to_specialist_id, assigned_to_sea_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const hasAccess = session.provider_id === userId ||
      session.assigned_to_specialist_id === userId ||
      session.assigned_to_sea_id === userId;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const upsertRecords = attendance.map(record => ({
      session_id: sessionId,
      student_id: record.student_id,
      session_date: session_date,
      present: record.present,
      absence_reason: record.present ? null : (record.absence_reason || null),
      marked_by: userId
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
  }
);

// PUT handler for quick-marking a single student's attendance
export const PUT = withRoute<{ sessionId: string }, z.infer<typeof putSchema>>(
  { body: putSchema },
  async ({ userId, body, params }) => {
    const { sessionId } = params;

    if (sessionId.startsWith('temp-')) {
      return NextResponse.json({ error: 'Cannot save attendance for temporary sessions' }, { status: 400 });
    }

    const { student_id, session_date, present, absence_reason } = body;
    const serviceClient = createServiceClient();

    const { data: session, error: sessionError } = await serviceClient
      .from('schedule_sessions')
      .select('id, provider_id, assigned_to_specialist_id, assigned_to_sea_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const hasAccess = session.provider_id === userId ||
      session.assigned_to_specialist_id === userId ||
      session.assigned_to_sea_id === userId;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: savedAttendance, error: upsertError } = await serviceClient
      .from('attendance')
      .upsert({
        session_id: sessionId,
        student_id,
        session_date,
        present,
        absence_reason: present ? null : (absence_reason?.trim() || null),
        marked_by: userId
      }, {
        onConflict: 'session_id,student_id,session_date'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error saving attendance:', upsertError);
      return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      attendance: savedAttendance,
      message: `Marked as ${present ? 'present' : 'absent'}`
    });
  }
);
