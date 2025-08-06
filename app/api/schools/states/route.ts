import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Fetch all states from the database
    const { data: states, error } = await supabase
      .from('states')
      .select('id, name, full_name')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching states:', error);
      return NextResponse.json(
        { error: 'Failed to fetch states' },
        { status: 500 }
      );
    }

    // Set cache headers for states (rarely change)
    const response = NextResponse.json(states || []);
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    
    return response;
  } catch (error) {
    console.error('Unexpected error in states endpoint:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}