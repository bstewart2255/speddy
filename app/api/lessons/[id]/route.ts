import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { withRoute } from '@/lib/api/with-route';

// DELETE: Remove saved lesson
export const DELETE = withRoute<{ id: string }>({}, async ({ userId, params }) => {
  const supabase = await createClient();
  const lessonId = params.id;

  // Verify the lesson belongs to the user before deleting.
  const { data: lesson, error: fetchError } = await supabase
    .from('lessons')
    .select('provider_id')
    .eq('id', lessonId)
    .single();

  if (fetchError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  }

  if (lesson.provider_id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { error: deleteError } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId);

  if (deleteError) {
    log.error('Failed to delete lesson', deleteError, { userId, lessonId });
    return NextResponse.json({ error: 'Failed to delete lesson' }, { status: 500 });
  }

  log.info('Lesson deleted successfully', { userId, lessonId });
  return NextResponse.json({ success: true });
});
