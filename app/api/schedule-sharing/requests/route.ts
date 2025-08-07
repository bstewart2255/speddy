import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const school_id = searchParams.get('school_id');

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

    // Get share requests for this school, excluding the current user's own requests
    const { data, error } = await supabase
      .from('schedule_share_requests')
      .select(`
        id,
        sharer_id,
        school_id,
        created_at,
        profiles!schedule_share_requests_sharer_id_fkey (
          id,
          full_name,
          email,
          role
        )
      `)
      .eq('school_id', school_id)
      .neq('sharer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching share requests:', error);
      return NextResponse.json(
        { error: 'Failed to fetch share requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in get share requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}