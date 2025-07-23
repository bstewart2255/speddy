import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { log } from '@/lib/monitoring/logger';

// GET: Fetch user's saved worksheets
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();
    
    log.info('Fetching saved worksheets for user', { userId });
    
    const { data: lessons, error } = await supabase
      .from('saved_worksheets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      log.error('Failed to fetch saved worksheets from Supabase', error, { userId, errorMessage: error.message });
      return NextResponse.json(
        { error: 'Failed to fetch saved worksheets', details: error.message },
        { status: 500 }
      );
    }

    log.info('Successfully fetched saved worksheets', { userId, count: lessons?.length || 0 });
    return NextResponse.json(lessons || []);
  } catch (error) {
    log.error('Error in GET /api/saved_worksheets', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST: Save new worksheet
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
      .from('saved_worksheets')
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
      log.error('Failed to save worksheet', error, { userId });
      return NextResponse.json(
        { error: 'Failed to save worksheet' },
        { status: 500 }
      );
    }

    log.info('Worksheet saved successfully', { 
      userId, 
      lessonId: lesson.id,
      subject,
      grade 
    });

    return NextResponse.json(lesson);
  } catch (error) {
    log.error('Error in POST /api/saved_worksheets', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});