import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { log } from '@/lib/monitoring/logger';

// GET: Fetch user's lessons
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();
    
    const { data: lessons, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      log.error('Failed to fetch lessons', error, { userId });
      return NextResponse.json(
        { error: 'Failed to fetch lessons' },
        { status: 500 }
      );
    }

    return NextResponse.json(lessons || []);
  } catch (error) {
    log.error('Error in GET /api/lessons', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST: Save new lesson
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    const { title, subject, grade, time_duration, content } = body;
    
    // Validate required fields
    if (!title || !subject || !grade || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { data: lesson, error } = await supabase
      .from('lessons')
      .insert({
        user_id: userId,
        title,
        subject,
        grade,
        time_duration,
        content
      })
      .select()
      .single();

    if (error) {
      log.error('Failed to save lesson', error, { userId });
      return NextResponse.json(
        { error: 'Failed to save lesson' },
        { status: 500 }
      );
    }

    log.info('Lesson saved successfully', { 
      userId, 
      lessonId: lesson.id,
      subject,
      grade 
    });

    return NextResponse.json(lesson);
  } catch (error) {
    log.error('Error in POST /api/lessons', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});