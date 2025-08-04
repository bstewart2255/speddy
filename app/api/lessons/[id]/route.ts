import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';

// DELETE: Remove saved worksheet
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string | undefined;
  
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
    
    userId = user.id;
    const { id: lessonId } = await params;
    
    // First verify the saved worksheet belongs to the user
    const { data: lesson, error: fetchError } = await supabase
      .from('saved_worksheets')
      .select('user_id')
      .eq('id', lessonId)
      .single();

    if (fetchError || !lesson) {
      return NextResponse.json(
        { error: 'Saved worksheet not found' },
        { status: 404 }
      );
    }

    if (lesson.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Delete the saved worksheet
    const { error: deleteError } = await supabase
      .from('saved_worksheets')
      .delete()
      .eq('id', lessonId);

    if (deleteError) {
      log.error('Failed to delete saved worksheet', deleteError, { userId, lessonId });
      return NextResponse.json(
        { error: 'Failed to delete saved worksheet' },
        { status: 500 }
      );
    }

    log.info('Saved worksheet deleted successfully', { userId, lessonId });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Error in DELETE /api/saved_worksheets/[id]', error, { userId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}