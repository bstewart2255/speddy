import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { school_id } = await request.json();

    if (!school_id) {
      return NextResponse.json(
        { error: 'school_id is required' },
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

    // Create or update share request (upsert using unique constraint)
    const { data, error } = await supabase
      .from('schedule_share_requests')
      .upsert(
        {
          sharer_id: user.id,
          school_id: school_id,
        },
        {
          onConflict: 'sharer_id,school_id',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error creating share request:', error);
      return NextResponse.json(
        { error: 'Failed to create share request' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in create share request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}