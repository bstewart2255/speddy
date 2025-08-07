import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { sharer_id, school_id } = await request.json();

    if (!sharer_id || !school_id) {
      return NextResponse.json(
        { error: 'sharer_id and school_id are required' },
        { status: 400 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Remove the share request without importing
    const { error } = await supabase
      .from('schedule_share_requests')
      .delete()
      .eq('sharer_id', sharer_id)
      .eq('school_id', school_id);

    if (error) {
      console.error('Error dismissing share request:', error);
      return NextResponse.json(
        { error: 'Failed to dismiss share request' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in dismiss share request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}