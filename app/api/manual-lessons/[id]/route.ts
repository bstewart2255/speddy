import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

// PUT - Update existing lesson
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (req: NextRequest, userId: string) => {
    const perf = measurePerformanceWithAlerts('update_manual_lesson', 'api');
    const params = await context.params;
    const lessonId = params.id;
  
    
    try {
      const supabase = await createClient();
      const updateData = await req.json();
    
    // Validate lesson ID
    if (!lessonId) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'Lesson ID is required' },
        { status: 400 }
      );
    }
    
    log.info('Updating manual lesson', {
      userId,
      lessonId,
      fieldsToUpdate: Object.keys(updateData)
    });

    // First, verify ownership
    const verifyPerf = measurePerformanceWithAlerts('verify_lesson_ownership', 'database');
    const { data: existingLesson, error: fetchError } = await supabase
      .from('manual_lesson_plans')
      .select('id, provider_id')
      .eq('id', lessonId)
      .single();
    verifyPerf.end({ success: !fetchError });

    if (fetchError || !existingLesson) {
      log.warn('Lesson not found for update', {
        userId,
        lessonId,
        error: fetchError
      });
      
      perf.end({ success: false, error: 'not_found' });
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      );
    }

    if (existingLesson.provider_id !== userId) {
      log.warn('Unauthorized lesson update attempt', {
        userId,
        lessonId,
        ownerId: existingLesson.provider_id
      });
      
      track.event('manual_lesson_update_unauthorized', {
        userId,
        lessonId
      });
      
      perf.end({ success: false, error: 'unauthorized' });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Prepare update data - only include provided fields
    const fieldsToUpdate: any = {};
    
    if (updateData.title !== undefined) fieldsToUpdate.title = updateData.title;
    if (updateData.subject !== undefined) fieldsToUpdate.subject = updateData.subject || null;
    if (updateData.grade_levels !== undefined) {
      fieldsToUpdate.grade_levels = updateData.grade_levels ? 
        (Array.isArray(updateData.grade_levels) ? 
          updateData.grade_levels : 
          updateData.grade_levels.split(',').map((g: string) => g.trim())) : 
        null;
    }
    if (updateData.duration_minutes !== undefined) fieldsToUpdate.duration_minutes = updateData.duration_minutes || null;
    if (updateData.objectives !== undefined) fieldsToUpdate.objectives = updateData.objectives || null;
    if (updateData.materials !== undefined) fieldsToUpdate.materials = updateData.materials || null;
    if (updateData.activities !== undefined) fieldsToUpdate.activities = updateData.activities || null;
    if (updateData.assessment !== undefined) fieldsToUpdate.assessment = updateData.assessment || null;
    if (updateData.notes !== undefined) fieldsToUpdate.notes = updateData.notes || null;
    if (updateData.lesson_date !== undefined) fieldsToUpdate.lesson_date = updateData.lesson_date;

    // Validate required fields if being updated
    if (fieldsToUpdate.title !== undefined && !fieldsToUpdate.title?.trim()) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'Title cannot be empty' },
        { status: 400 }
      );
    }

    // Update the lesson - updated_at will be handled by the trigger
    const updatePerf = measurePerformanceWithAlerts('update_manual_lesson_db', 'database');
    const { data, error } = await supabase
      .from('manual_lesson_plans')
      .update(fieldsToUpdate)
      .eq('id', lessonId)
      .eq('provider_id', userId) // Extra safety check
      .select('*')
      .single();
    updatePerf.end({ success: !error });

    if (error) {
      log.error('Error updating manual lesson', error, {
        userId,
        lessonId,
        errorCode: error.code,
        errorDetails: error.details
      });
      
      track.event('manual_lesson_update_failed', {
        userId,
        lessonId,
        error: error.message,
        errorCode: error.code
      });
      
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to update lesson plan' },
        { status: 500 }
      );
    }

    log.info('Manual lesson updated successfully', {
      userId,
      lessonId,
      updatedFields: Object.keys(fieldsToUpdate)
    });
    
    track.event('manual_lesson_updated', {
      userId,
      lessonId,
      fieldsUpdated: Object.keys(fieldsToUpdate).length
    });
    
    perf.end({ success: true, lessonId });
    return NextResponse.json({ success: true, lesson: data });
  } catch (error) {
    log.error('Error in update manual lesson route', error, { 
      userId,
      lessonId 
    });
    
    perf.end({ success: false, error: 'unexpected' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
  })(request);
}

// DELETE - Delete lesson
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (req: NextRequest, userId: string) => {
    const perf = measurePerformanceWithAlerts('delete_manual_lesson', 'api');
    const params = await context.params;
    const lessonId = params.id;
  
    try {
      const supabase = await createClient();
    
    // Validate lesson ID
    if (!lessonId) {
      perf.end({ success: false, error: 'validation' });
      return NextResponse.json(
        { error: 'Lesson ID is required' },
        { status: 400 }
      );
    }
    
    log.info('Deleting manual lesson', {
      userId,
      lessonId
    });

    // First, verify ownership
    const verifyPerf = measurePerformanceWithAlerts('verify_lesson_ownership_delete', 'database');
    const { data: existingLesson, error: fetchError } = await supabase
      .from('manual_lesson_plans')
      .select('id, provider_id, title')
      .eq('id', lessonId)
      .single();
    verifyPerf.end({ success: !fetchError });

    if (fetchError || !existingLesson) {
      log.warn('Lesson not found for deletion', {
        userId,
        lessonId,
        error: fetchError
      });
      
      perf.end({ success: false, error: 'not_found' });
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      );
    }

    if (existingLesson.provider_id !== userId) {
      log.warn('Unauthorized lesson deletion attempt', {
        userId,
        lessonId,
        ownerId: existingLesson.provider_id
      });
      
      track.event('manual_lesson_delete_unauthorized', {
        userId,
        lessonId
      });
      
      perf.end({ success: false, error: 'unauthorized' });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Delete the lesson - RLS will provide additional security
    const deletePerf = measurePerformanceWithAlerts('delete_manual_lesson_db', 'database');
    const { error } = await supabase
      .from('manual_lesson_plans')
      .delete()
      .eq('id', lessonId)
      .eq('provider_id', userId); // Extra safety check
    deletePerf.end({ success: !error });

    if (error) {
      log.error('Error deleting manual lesson', error, {
        userId,
        lessonId,
        errorCode: error.code
      });
      
      track.event('manual_lesson_delete_failed', {
        userId,
        lessonId,
        error: error.message,
        errorCode: error.code
      });
      
      perf.end({ success: false, error: 'database' });
      return NextResponse.json(
        { error: 'Failed to delete lesson plan' },
        { status: 500 }
      );
    }

    log.info('Manual lesson deleted successfully', {
      userId,
      lessonId,
      title: existingLesson.title
    });
    
    track.event('manual_lesson_deleted', {
      userId,
      lessonId,
      title: existingLesson.title
    });
    
    perf.end({ success: true, lessonId });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in delete manual lesson route', error, { 
      userId,
      lessonId 
    });
    
    perf.end({ success: false, error: 'unexpected' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
  })(request);
}