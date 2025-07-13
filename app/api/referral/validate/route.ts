import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    
    if (!code) {
      return NextResponse.json({ valid: false });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('referral_codes')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    return NextResponse.json({ valid: !!data && !error });
  } catch (error) {
    return NextResponse.json({ valid: false });
  }
}