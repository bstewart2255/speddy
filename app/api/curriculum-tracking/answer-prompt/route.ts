import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

// POST - Handle lesson completion prompt answer (Yes/No)
export async function POST(request: NextRequest) {
  const perf = measurePerformanceWithAlerts('answer_curriculum_prompt', 'api');
  let userId: string | undefined;

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      perf.end({ success: false });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const body = await request.json();
    const {
      sessionId,
      answer,
      previousLesson,
      curriculumType,
      curriculumLevel
    } = body;

    // Validate required fields
    if (!sessionId || !answer || !curriculumType || !curriculumLevel) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'sessionId, answer, curriculumType, and curriculumLevel are required' },
        { status: 400 }
      );
    }

    // Validate previousLesson is a positive integer
    if (typeof previousLesson !== 'number' || !Number.isInteger(previousLesson) || previousLesson < 1) {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'previousLesson must be a positive integer' },
        { status: 400 }
      );
    }

    // Validate answer value
    if (answer !== 'yes' && answer !== 'no') {
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'answer must be "yes" or "no"' },
        { status: 400 }
      );
    }

    log.info('Answering curriculum prompt', {
      userId,
      sessionId,
      answer,
      previousLesson,
      curriculumType,
      curriculumLevel
    });

    // Verify user has access to the session
    const { data: session, error: accessError } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('id', sessionId)
      .or(`provider_id.eq.${userId},assigned_to_specialist_id.eq.${userId},assigned_to_sea_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (accessError || !session) {
      log.warn('User does not have access to session', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Calculate new lesson number
    const newLesson = answer === 'yes' ? previousLesson + 1 : previousLesson;

    // Use service client to bypass RLS (access already verified)
    const serviceClient = createServiceClient();

    // Check if curriculum tracking already exists for this session and curriculum type
    const { data: existing } = await serviceClient
      .from('curriculum_tracking')
      .select('*')
      .eq('session_id', sessionId)
      .eq('curriculum_type', curriculumType)
      .maybeSingle();

    let data;
    let error;

    if (existing) {
      // Update existing curriculum tracking
      const result = await serviceClient
        .from('curriculum_tracking')
        .update({
          curriculum_type: curriculumType,
          curriculum_level: curriculumLevel,
          current_lesson: newLesson,
          prompt_answered: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Create new curriculum tracking
      const result = await serviceClient
        .from('curriculum_tracking')
        .insert({
          session_id: sessionId,
          curriculum_type: curriculumType,
          curriculum_level: curriculumLevel,
          current_lesson: newLesson,
          prompt_answered: true
        })
        .select('*')
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      log.error('Error saving curriculum prompt answer', error, {
        userId,
        sessionId,
        answer
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Failed to save curriculum tracking', details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      log.error('No data returned from curriculum tracking save', {
        userId,
        sessionId
      });
      perf.end({ success: false });
      return NextResponse.json(
        { error: 'Curriculum tracking save returned no data' },
        { status: 500 }
      );
    }

    log.info('Curriculum prompt answered successfully', {
      userId,
      sessionId,
      answer,
      previousLesson,
      newLesson,
      trackingId: data.id
    });

    track.event('curriculum_prompt_answered', {
      userId,
      sessionId,
      answer,
      previousLesson,
      newLesson,
      curriculumType,
      curriculumLevel
    });

    perf.end({ success: true, trackingId: data.id });
    return NextResponse.json({ data }, { status: existing ? 200 : 201 });
  } catch (error) {
    log.error('Error in answer-curriculum-prompt route', error, { userId });
    perf.end({ success: false });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
