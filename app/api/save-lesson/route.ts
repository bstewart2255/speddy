import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      timeSlot, 
      students, 
      content, 
      lessonDate,
      schoolSite,
      notes 
    } = await request.json();

    // Extract student IDs and create student details JSON
    const studentIds = students.map((s: any) => s.id);
    const studentDetails = students.map((s: any) => ({
      id: s.id,
      initials: s.initials,
      grade_level: s.grade_level,
      teacher_name: s.teacher_name
    }));

    // Save the lesson
    const { data, error } = await supabase
      .from('lessons')
      .insert({
        provider_id: user.id,
        time_slot: timeSlot,
        student_ids: studentIds,
        student_details: studentDetails,
        content: content,
        lesson_date: lessonDate || new Date().toISOString().split('T')[0],
        school_site: schoolSite,
        notes: notes
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving lesson:', error);
      return NextResponse.json({ error: 'Failed to save lesson' }, { status: 500 });
    }

    return NextResponse.json({ success: true, lesson: data });
  } catch (error) {
    console.error('Error in save-lesson route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Fetch user's lessons
    const { data: lessons, error, count } = await supabase
      .from('lessons')
      .select('*', { count: 'exact' })
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching lessons:', error);
      return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
    }

    return NextResponse.json({ 
      lessons: lessons || [], 
      total: count || 0,
      limit,
      offset 
    });
  } catch (error) {
    console.error('Error in get-lessons route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}