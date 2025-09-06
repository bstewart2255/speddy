import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

// POST - Create new manual lesson
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('create_manual_lesson', 'api');
  
  try {
    const supabase = await createClient();

    const lessonData = await request.json();
    
    // Validate required fields
    if (!lessonData.title?.trim()) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!lessonData.lesson_date) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'Lesson date is required' },
        { status: 400 }
      );
    }
    
    log.info('Creating manual lesson', {
      userId,
      title: lessonData.title,
      lessonDate: lessonData.lesson_date,
      hasObjectives: !!lessonData.objectives,
      hasActivities: !!lessonData.activities
    });

    // Prepare the data for insertion
    const insertData = {
      provider_id: userId,
      lesson_date: lessonData.lesson_date,
      title: lessonData.title,
      subject: lessonData.subject || null,
      grade_levels: lessonData.grade_levels ? 
        (Array.isArray(lessonData.grade_levels) ? 
          lessonData.grade_levels : 
          lessonData.grade_levels.split(',').map((g: string) => g.trim())) : 
        null,
      duration_minutes: lessonData.duration_minutes || null,
      objectives: lessonData.objectives || null,
      materials: lessonData.materials || null,
      activities: lessonData.activities || null,
      assessment: lessonData.assessment || null,
      notes: lessonData.notes || null
    };

    // Save the manual lesson to unified lessons table
    const savePerf = measurePerformanceWithAlerts('save_manual_lesson_db', 'database');
    
    // Restructure data for unified lessons table
    const unifiedLessonData = {
      provider_id: insertData.provider_id,
      lesson_source: 'manual',
      lesson_date: insertData.lesson_date,
      title: insertData.title,
      subject: insertData.subject,
      grade_levels: insertData.grade_levels,
      duration_minutes: insertData.duration_minutes,
      content: {
        objectives: insertData.objectives,
        materials: insertData.materials,
        activities: insertData.activities,
        assessment: insertData.assessment
      },
      notes: insertData.notes,
      school_id: insertData.school_id || null,
      district_id: insertData.district_id || null,
      state_id: insertData.state_id || null
    };
    
    const { data, error } = await supabase
      .from('lessons')
      .insert(unifiedLessonData)
      .select('*')
      .single();
    savePerf.end({ success: !error });

    if (error) {
      log.error('Error saving manual lesson', error, {
        userId,
        title: lessonData.title,
        errorCode: error.code,
        errorDetails: error.details
      });
      
      track.event('manual_lesson_save_failed', {
        userId,
        error: error.message,
        errorCode: error.code
      });
      
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to save lesson plan' },
        { status: 500 }
      );
    }

    log.info('Manual lesson saved successfully', {
      userId,
      lessonId: data.id,
      title: data.title
    });
    
    track.event('manual_lesson_saved', {
      userId,
      lessonId: data.id,
      lessonDate: data.lesson_date,
      hasObjectives: !!data.objectives,
      hasActivities: !!data.activities,
      hasMaterials: !!data.materials
    });
    
    perf.end({ success: true, lessonId: data.id });
    return NextResponse.json({ success: true, lesson: data });
  } catch (error) {
    log.error('Error in create manual lesson route', error, { userId });
    
    perf.end({ success: false, error: 'unexpected' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// GET - Fetch lessons for date range
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('fetch_manual_lessons', 'api');
  
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    
    // Validate date parameters
    if (!startDate || !endDate) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'start_date and end_date are required' },
        { status: 400 }
      );
    }
    
    log.info('Fetching manual lessons', {
      userId,
      startDate,
      endDate
    });

    // Fetch lessons for the date range from unified lessons table
    const fetchPerf = measurePerformanceWithAlerts('fetch_manual_lessons_db', 'database');
    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('provider_id', userId)
      .eq('lesson_source', 'manual')
      .gte('lesson_date', startDate)
      .lte('lesson_date', endDate)
      .order('lesson_date', { ascending: true });
    fetchPerf.end({ success: !error });

    if (error) {
      log.error('Error fetching manual lessons', error, {
        userId,
        startDate,
        endDate,
        errorCode: error.code
      });
      
      track.event('manual_lessons_fetch_failed', {
        userId,
        error: error.message,
        errorCode: error.code
      });
      
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to fetch lesson plans' },
        { status: 500 }
      );
    }

    log.info('Manual lessons fetched successfully', {
      userId,
      lessonCount: data?.length || 0,
      startDate,
      endDate
    });
    
    track.event('manual_lessons_fetched', {
      userId,
      lessonCount: data?.length || 0,
      dateRange: `${startDate} to ${endDate}`
    });
    
    perf.end({ success: true, count: data?.length || 0 });
    return NextResponse.json({ 
      success: true, 
      lessons: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    log.error('Error in fetch manual lessons route', error, { userId });
    
    perf.end({ success: false, error: 'unexpected' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});