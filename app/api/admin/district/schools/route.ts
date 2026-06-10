import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { withRoute } from '@/lib/api/with-route';

const log = logger.child({ module: 'district-admin-schools' });

/**
 * Build a 500 response. Outside production (preview/local) include the real
 * error detail to aid debugging; in production stay opaque so raw Supabase/
 * Postgres error text is never leaked to clients.
 */
function errorResponse(
  error: { message?: string | null; code?: string | null; details?: string | null; hint?: string | null } | null | undefined,
  fallback: string
) {
  const expose = process.env.VERCEL_ENV !== 'production';
  const detail = [error?.message, error?.code, error?.details, error?.hint].filter(Boolean).join(' | ');
  return NextResponse.json({ error: expose && detail ? detail : fallback }, { status: 500 });
}

/**
 * POST /api/admin/district/schools
 * Create a new school in the district admin's district
 */
export const POST = withRoute({}, async ({ req: request, userId }) => {
  try {
    const supabase = await createClient();

    // Verify user is a district admin and get their district
    const { data: adminPermission, error: permError } = await supabase
      .from('admin_permissions')
      .select('district_id')
      .eq('admin_id', userId)
      .eq('role', 'district_admin')
      .single();

    if (permError || !adminPermission?.district_id) {
      log.warn('Non-district-admin tried to create school', { userId });
      return NextResponse.json(
        { error: 'Forbidden: District admin access required' },
        { status: 403 }
      );
    }

    const districtId = adminPermission.district_id;

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

    // TEMP diagnostic (non-production only): if the service-role key is missing,
    // report which Supabase-related env vars the runtime actually sees — names
    // only, never values — to pinpoint a missing/mis-named/mis-scoped key.
    // Remove once the env config is confirmed.
    if (process.env.VERCEL_ENV !== 'production' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const present = Object.keys(process.env)
        .filter((k) => /SUPABASE|SERVICE_ROLE|POSTGRES/i.test(k))
        .sort();
      const diag = `Service client unavailable | VERCEL_ENV=${process.env.VERCEL_ENV ?? '(unset)'} | hasUrl=${!!process.env.NEXT_PUBLIC_SUPABASE_URL} | hasServiceKey=false | present=[${present.join(', ') || 'none'}]`;
      console.error('[district-admin-schools]', diag);
      return NextResponse.json({ error: diag }, { status: 500 });
    }

    // Use admin client for insert (bypass RLS)
    const adminClient = createServiceClient();

    // Generate UUID for school
    const schoolId = uuidv4();

    log.info('District admin creating school', {
      schoolId,
      name,
      districtId,
      createdBy: userId,
    });

    // Insert the school
    const { data: newSchool, error: insertError } = await adminClient
      .from('schools')
      .insert({
        id: schoolId,
        name: name.trim(),
        district_id: districtId,
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
      return errorResponse(insertError, 'Failed to create school');
    }

    log.info('School created successfully by district admin', {
      schoolId,
      name,
      districtId,
      createdBy: userId,
    });

    return NextResponse.json({
      success: true,
      school: newSchool,
    });
  } catch (error) {
    log.error('Unexpected error in district admin create-school', error);
    const err = error as { message?: string; code?: string; details?: string; hint?: string; stack?: string };
    // Emit structured detail to the platform logs so the cause is diagnosable.
    console.error('[district-admin-schools] create failed', {
      message: err?.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
      stack: err?.stack,
    });
    return errorResponse(err, 'Internal server error');
  }
});
