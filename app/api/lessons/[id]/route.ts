import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';

// DELETE: Remove lesson
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = user.id;
    const lessonId = params.id;
    
    // First verify the lesson belongs to the user
    const { data: lesson, error: fetchError } = await supabase
      .from('lessons')
      .select('user_id')
      .eq('id', lessonId)
      .single();

    if (fetchError || !lesson) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      );
    }

    if (lesson.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Delete the lesson
    const { error: deleteError } = await supabase
      .from('lessons')
      .delete()
      .eq('id', lessonId);

    if (deleteError) {
      log.error('Failed to delete lesson', deleteError, { userId, lessonId });
      return NextResponse.json(
        { error: 'Failed to delete lesson' },
        { status: 500 }
      );
    }

    log.info('Lesson deleted successfully', { userId, lessonId });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in DELETE /api/lessons/[id]', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}