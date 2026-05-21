import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { withRoute } from '@/lib/api/with-route';

const querySchema = z.object({
  lesson_date: z.string().min(1),
  time_slot: z.string().min(1),
});

// GET - Fetch a lesson by session parameters (provider_id, lesson_date, time_slot)
export const GET = withRoute({ query: querySchema }, async ({ userId, query }) => {
  const supabase = await createClient();
  const { lesson_date: lessonDate, time_slot: timeSlot } = query;

  log.info('Fetching lesson by session', { userId, lessonDate, timeSlot });

  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('provider_id', userId)
    .eq('lesson_date', lessonDate)
    .eq('time_slot', timeSlot)
    .maybeSingle();

  if (error) {
    log.error('Error fetching lesson by session', error, { userId, lessonDate, timeSlot });
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 });
  }

  if (!lesson) {
    return NextResponse.json({ lesson: null }, { status: 200 });
  }

  log.info('Lesson fetched successfully', { userId, lessonId: lesson.id, lessonDate, timeSlot });
  return NextResponse.json({ lesson });
});
