import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const stateId = searchParams.get('state_id');
    const searchQuery = searchParams.get('search');

    if (!stateId) {
      return NextResponse.json(
        { error: 'state_id parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Build the query
    let query = supabase
      .from('districts')
      .select('id, name, state_id')
      .eq('state_id', stateId)
      .order('name', { ascending: true })
      .limit(200);

    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    const { data: districts, error } = await query;

    if (error) {
      console.error('Error fetching districts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch districts' },
        { status: 500 }
      );
    }

    // Set cache headers (districts change infrequently)
    const response = NextResponse.json(districts || []);
    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    
    return response;
  } catch (error) {
    console.error('Unexpected error in districts endpoint:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}