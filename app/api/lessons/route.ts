import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';
import { log } from '@/lib/monitoring/logger';

// GET: Fetch user's saved lessons
export const GET = withRoute({}, async ({ userId }) => {
  try {
    const supabase = await createClient();
    
    log.info('Fetching saved lessons for user', { userId });
    
    // Query the unified lessons table for AI-generated lessons
    const { data: lessons, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('provider_id', userId)
      .eq('lesson_source', 'ai_generated')
      .order('created_at', { ascending: false });

    if (error) {
      log.error('Failed to fetch lessons from Supabase', error, { userId, errorMessage: error.message });
      return NextResponse.json(
        { error: 'Failed to fetch lessons', details: error.message },
        { status: 500 }
      );
    }

    // Transform the data to match the expected format for the lesson bank
    const transformedLessons = (lessons || []).map(lesson => {
      // Extract title and other fields from content JSON if available
      const content = lesson.content || {};
      const lessonData = content.lesson || {};
      
      return {
        id: lesson.id,
        title: lessonData.title || lesson.topic || 'Untitled Lesson',
        subject: lesson.subject || '',
        grade: lesson.grade_level || '',
        time_duration: lessonData.duration ? `${lessonData.duration} minutes` : lesson.duration || '',
        content: JSON.stringify(content), // Keep full content as string
        created_at: lesson.created_at
      };
    });

    log.info('Successfully fetched lessons', { userId, count: transformedLessons.length });
    return NextResponse.json(transformedLessons);
  } catch (error) {
    log.error('Error in GET /api/lessons', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

const saveLessonSchema = z
  .object({
    title: z.string().min(1),
    subject: z.string().min(1),
    grade: z.string().min(1),
    content: z.any().refine(v => v !== undefined && v !== null && v !== '', 'content is required'),
    time_duration: z.string().optional(),
  })
  .passthrough();

// POST: Save new lesson (for manual lesson creation)
export const POST = withRoute({ body: saveLessonSchema }, async ({ userId, body }) => {
  try {
    const supabase = await createClient();
    const { title, subject, grade, time_duration, content } = body;

    // Parse duration from string format (e.g., "15 minutes" -> 15)
    const durationMatch = time_duration?.match(/(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : null;

    // Create content structure
    let lessonContent = content;
    if (typeof content === 'string') {
      try {
        lessonContent = JSON.parse(content);
      } catch {
        return NextResponse.json({ error: 'content must be valid JSON' }, { status: 400 });
      }
    }

    const { data: lesson, error } = await supabase
      .from('lessons')
      .insert({
        provider_id: userId,
        lesson_source: 'manual',
        lesson_status: 'published',
        subject,
        grade_level: grade,
        topic: title,
        duration,
        content: lessonContent,
        lesson_date: new Date().toISOString().split('T')[0],
        time_slot: 'structured'
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

    // Transform to match expected format
    const transformedLesson = {
      id: lesson.id,
      title,
      subject,
      grade,
      time_duration,
      content: JSON.stringify(lessonContent),
      created_at: lesson.created_at
    };

    return NextResponse.json(transformedLesson);
  } catch (error) {
    log.error('Error in POST /api/lessons', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});