import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ module: 'district-admin-schools' });

/**
 * POST /api/admin/district/schools
 * Create a new school in the district admin's district
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a district admin and get their district
    const { data: adminPermission, error: permError } = await supabase
      .from('admin_permissions')
      .select('district_id, state_id')
      .eq('admin_id', user.id)
      .eq('role', 'district_admin')
      .single();

    if (permError || !adminPermission?.district_id) {
      log.warn('Non-district-admin tried to create school', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: District admin access required' },
        { status: 403 }
      );
    }

    const districtId = adminPermission.district_id;
    const stateId = adminPermission.state_id;

    // Parse request body
    const body = await request.json();
    const { name, city, schoolType, gradeSpanLow, gradeSpanHigh, phone, website } = body as {
      name: string;
      city?: string;
      schoolType?: string;
      gradeSpanLow?: string;
      gradeSpanHigh?: string;
      phone?: string;
      website?: string;
    };

    // Validation
    if (!name?.trim()) {
      return NextResponse.json({ error: 'School name is required' }, { status: 400 });
    }

    // Use admin client for insert (bypass RLS)
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate UUID for school
    const schoolId = uuidv4();

    log.info('District admin creating school', {
      schoolId,
      name,
      districtId,
      createdBy: user.id,
    });

    // Insert the school
    const { data: newSchool, error: insertError } = await adminClient
      .from('schools')
      .insert({
        id: schoolId,
        name: name.trim(),
        district_id: districtId,
        state_id: stateId,
        city: city?.trim() || null,
        school_type: schoolType || null,
        grade_span_low: gradeSpanLow || null,
        grade_span_high: gradeSpanHigh || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
      })
      .select()
      .single();

    if (insertError) {
      log.error('Failed to create school', insertError);
      return NextResponse.json(
        { error: insertError.message || 'Failed to create school' },
        { status: 500 }
      );
    }

    log.info('School created successfully by district admin', {
      schoolId,
      name,
      districtId,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      school: newSchool,
    });
  } catch (error) {
    log.error('Unexpected error in district admin create-school', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
