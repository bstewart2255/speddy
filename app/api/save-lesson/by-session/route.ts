import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { withAuth } from '@/lib/api/with-auth';

// GET - Fetch a lesson by session parameters (provider_id, lesson_date, time_slot)
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const supabase = await createClient();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const lessonDate = searchParams.get('lesson_date');
    const timeSlot = searchParams.get('time_slot');

    if (!lessonDate || !timeSlot) {
      return NextResponse.json(
        { error: 'lesson_date and time_slot are required' },
        { status: 400 }
      );
    }

    log.info('Fetching lesson by session', {
      userId,
      lessonDate,
      timeSlot
    });

    // Fetch lesson by provider_id, lesson_date, and time_slot
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('provider_id', userId)
      .eq('lesson_date', lessonDate)
      .eq('time_slot', timeSlot)
      .maybeSingle();

    if (error) {
      log.error('Error fetching lesson by session', error, {
        userId,
        lessonDate,
        timeSlot
      });
      return NextResponse.json(
        { error: 'Failed to fetch lesson' },
        { status: 500 }
      );
    }

    if (!lesson) {
      return NextResponse.json({ lesson: null }, { status: 200 });
    }

    log.info('Lesson fetched successfully', {
      userId,
      lessonId: lesson.id,
      lessonDate,
      timeSlot
    });

    return NextResponse.json({ lesson });
  } catch (error) {
    log.error('Error in get-lesson-by-session route', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
