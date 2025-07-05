import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete the lesson - RLS will ensure user can only delete their own lessons
    const { error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', params.id)
      .eq('provider_id', user.id); // Extra safety check

    if (error) {
      console.error('Error deleting lesson:', error);
      return NextResponse.json({ error: 'Failed to delete lesson' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in delete-lesson route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}