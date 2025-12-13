import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ module: 'internal-create-school' });

export async function POST(request: NextRequest) {
  try {
    // Get current user to verify they're a speddy admin
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the user is a speddy admin
    const { data: profile, error: profileError } = (await supabase
      .from('profiles')
      .select('is_speddy_admin')
      .eq('id', user.id)
      .single()) as unknown as { data: { is_speddy_admin: boolean } | null; error: Error | null };

    if (profileError || !profile?.is_speddy_admin) {
      log.warn('Non-speddy-admin tried to create school', { userId: user.id });
      return NextResponse.json({ error: 'Forbidden: Speddy admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const {
      name,
      districtId,
      city,
      schoolType,
      gradeSpanLow,
      gradeSpanHigh,
      phone,
      website,
      mailingAddress,
      zip,
    } = body as {
      name: string;
      districtId: string;
      city: string | null;
      schoolType: string | null;
      gradeSpanLow: string | null;
      gradeSpanHigh: string | null;
      phone: string | null;
      website: string | null;
      mailingAddress: string | null;
      zip: string | null;
    };

    // Validation
    if (!name || !districtId) {
      return NextResponse.json({ error: 'Missing required fields: name, districtId' }, { status: 400 });
    }

    // Use admin client for insert
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify district exists
    const { data: district, error: districtError } = await adminClient
      .from('districts')
      .select('id, name')
      .eq('id', districtId)
      .single();

    if (districtError || !district) {
      return NextResponse.json({ error: 'Invalid district ID' }, { status: 400 });
    }

    // Generate UUID for school
    const schoolId = uuidv4();

    log.info('Creating school', {
      schoolId,
      name,
      districtId,
      createdBy: user.id,
    });

    // Insert the school
    const { error: insertError } = await adminClient.from('schools').insert({
      id: schoolId,
      name,
      district_id: districtId,
      city,
      school_type: schoolType,
      grade_span_low: gradeSpanLow,
      grade_span_high: gradeSpanHigh,
      phone,
      website,
      mailing_address: mailingAddress,
      zip,
    });

    if (insertError) {
      log.error('Failed to create school', insertError);
      return NextResponse.json({ error: insertError.message || 'Failed to create school' }, { status: 500 });
    }

    log.info('School created successfully', {
      schoolId,
      name,
      districtId,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      schoolId,
      name,
      districtId,
    });
  } catch (error) {
    log.error('Unexpected error in create-school', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
