import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';

export const DELETE = withRoute<{ id: string }>({}, async ({ userId, params }) => {
  const supabase = await createClient();

  // RLS plus the provider_id filter ensure a user can only delete their own lesson.
  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', params.id)
    .eq('provider_id', userId);

  if (error) {
    console.error('Error deleting lesson:', error);
    return NextResponse.json({ error: 'Failed to delete lesson' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
