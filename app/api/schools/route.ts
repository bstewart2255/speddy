import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const districtId = searchParams.get('district_id');
    const searchQuery = searchParams.get('search');

    if (!districtId) {
      return NextResponse.json(
        { error: 'district_id parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Build the query
    let query = supabase
      .from('schools')
      .select('id, name, district_id, school_type')
      .eq('district_id', districtId)
      .order('name', { ascending: true })
      .limit(500);

    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    const { data: schools, error } = await query;

    if (error) {
      console.error('Error fetching schools:', error);
      return NextResponse.json(
        { error: 'Failed to fetch schools' },
        { status: 500 }
      );
    }

    // Set cache headers (schools change infrequently)
    const response = NextResponse.json(schools || []);
    response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    
    return response;
  } catch (error) {
    console.error('Unexpected error in schools endpoint:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}