import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('save_lesson', 'api');
  
  try {
    const supabase = await createClient();

    const { 
      timeSlot, 
      students, 
      content, 
      lessonDate,
      schoolSite,
      notes 
    } = await request.json();
    
    log.info('Saving lesson', {
      userId,
      studentCount: students.length,
      timeSlot,
      lessonDate,
      schoolSite,
      contentLength: content?.length || 0
    });

    // Extract student IDs and create student details JSON
    const studentIds = students.map((s: any) => s.id);
    const studentDetails = students.map((s: any) => ({
      id: s.id,
      initials: s.initials,
      grade_level: s.grade_level,
      teacher_name: s.teacher_name
    }));

    // Save the lesson
    const savePerf = measurePerformanceWithAlerts('save_lesson_db', 'database');
    const { data, error } = await supabase
      .from('lessons')
      .insert({
        provider_id: userId,
        time_slot: timeSlot,
        student_ids: studentIds,
        student_details: studentDetails,
        content: content,
        lesson_date: lessonDate || new Date().toISOString().split('T')[0],
        school_site: schoolSite,
        notes: notes
      })
      .select('*')
      .single();
    savePerf.end({ success: !error });

    if (error) {
      log.error('Error saving lesson', error, {
        userId,
        studentIds
      });
      
      track.event('lesson_save_failed', {
        userId,
        error: error.message,
        errorCode: error.code
      });
      
      perf.end({ success: false });
      return NextResponse.json({ error: 'Failed to save lesson' }, { status: 500 });
    }

    log.info('Lesson saved successfully', {
      userId,
      lessonId: data.id,
      studentIds
    });
    
    track.event('lesson_saved', {
      userId,
      lessonId: data.id,
      studentCount: students.length,
      timeSlot,
      schoolSite
    });
    
    perf.end({ success: true, lessonId: data.id });
    return NextResponse.json({ success: true, lesson: data });
  } catch (error) {
    log.error('Error in save-lesson route', error, { userId });
    
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const GET = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('get_lessons', 'api');
  
  try {
    const supabase = await createClient();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    log.info('Fetching lessons', {
      userId,
      limit,
      offset
    });

    // Fetch user's lessons
    const fetchPerf = measurePerformanceWithAlerts('fetch_lessons_db', 'database');
    const { data: lessons, error, count } = await supabase
      .from('lessons')
      .select('*', { count: 'exact' })
      .eq('provider_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    fetchPerf.end({ 
      success: !error,
      count: count || 0 
    });

    if (error) {
      log.error('Error fetching lessons', error, { userId });
      
      track.event('lessons_fetch_failed', {
        userId,
        error: error.message,
        errorCode: error.code
      });
      
      perf.end({ success: false });
      return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
    }

    log.info('Lessons fetched successfully', {
      userId,
      lessonsCount: lessons?.length || 0,
      totalCount: count || 0
    });
    
    track.event('lessons_fetched', {
      userId,
      count: lessons?.length || 0,
      totalCount: count || 0,
      limit,
      offset
    });
    
    perf.end({ 
      success: true,
      count: lessons?.length || 0 
    });
    
    return NextResponse.json({ 
      lessons: lessons || [], 
      total: count || 0,
      limit,
      offset 
    });
  } catch (error) {
    log.error('Error in get-lessons route', error, { userId });
    
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});