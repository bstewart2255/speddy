import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'district-admin-school' });

interface RouteParams {
  params: { schoolId: string };
}

/**
 * Helper to verify district admin has access to the school
 */
async function verifyDistrictAdminAccess(
  supabase: ReturnType<typeof createRouteHandlerClient<Database>>,
  userId: string,
  schoolId: string
): Promise<{ allowed: boolean; districtId?: string; error?: string }> {
  // Get admin's district
  const { data: adminPermission, error: permError } = await supabase
    .from('admin_permissions')
    .select('district_id')
    .eq('admin_id', userId)
    .eq('role', 'district_admin')
    .single();

  if (permError || !adminPermission?.district_id) {
    return { allowed: false, error: 'District admin access required' };
  }

  // Verify school belongs to admin's district
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: school, error: schoolError } = await adminClient
    .from('schools')
    .select('district_id')
    .eq('id', schoolId)
    .single();

  if (schoolError || !school) {
    return { allowed: false, error: 'School not found' };
  }

  if (school.district_id !== adminPermission.district_id) {
    return { allowed: false, error: 'School is not in your district' };
  }

  return { allowed: true, districtId: adminPermission.district_id };
}

/**
 * PATCH /api/admin/district/schools/[schoolId]
 * Update a school in the district admin's district
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { schoolId } = params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, schoolId);
    if (!accessCheck.allowed) {
      log.warn('District admin access denied for school update', {
        userId: user.id,
        schoolId,
        reason: accessCheck.error,
      });
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { name, city, schoolType, gradeSpanLow, gradeSpanHigh, phone, website } = body as {
      name?: string;
      city?: string;
      schoolType?: string;
      gradeSpanLow?: string;
      gradeSpanHigh?: string;
      phone?: string;
      website?: string;
    };

    // Build update object (only include fields that were provided)
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (city !== undefined) updates.city = city.trim() || null;
    if (schoolType !== undefined) updates.school_type = schoolType || null;
    if (gradeSpanLow !== undefined) updates.grade_span_low = gradeSpanLow || null;
    if (gradeSpanHigh !== undefined) updates.grade_span_high = gradeSpanHigh || null;
    if (phone !== undefined) updates.phone = phone.trim() || null;
    if (website !== undefined) updates.website = website.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Use admin client for update
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    log.info('District admin updating school', {
      schoolId,
      updates: Object.keys(updates),
      updatedBy: user.id,
    });

    const { data: updatedSchool, error: updateError } = await adminClient
      .from('schools')
      .update(updates)
      .eq('id', schoolId)
      .select()
      .single();

    if (updateError) {
      log.error('Failed to update school', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update school' },
        { status: 500 }
      );
    }

    log.info('School updated successfully', {
      schoolId,
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      school: updatedSchool,
    });
  } catch (error) {
    log.error('Unexpected error in school update', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/district/schools/[schoolId]
 * Delete a school (only if no active dependencies)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { schoolId } = params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, schoolId);
    if (!accessCheck.allowed) {
      log.warn('District admin access denied for school delete', {
        userId: user.id,
        schoolId,
        reason: accessCheck.error,
      });
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client for checks and delete
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check for active dependencies
    const [teachersResult, providersResult, studentsResult, adminsResult] = await Promise.all([
      adminClient.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      adminClient.from('provider_schools').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      adminClient.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      adminClient.from('admin_permissions').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    ]);

    const teacherCount = teachersResult.count || 0;
    const providerCount = providersResult.count || 0;
    const studentCount = studentsResult.count || 0;
    const adminCount = adminsResult.count || 0;

    const totalDependencies = teacherCount + providerCount + studentCount + adminCount;

    if (totalDependencies > 0) {
      const reasons: string[] = [];
      if (teacherCount > 0) reasons.push(`${teacherCount} teacher(s)`);
      if (providerCount > 0) reasons.push(`${providerCount} provider(s)`);
      if (studentCount > 0) reasons.push(`${studentCount} student(s)`);
      if (adminCount > 0) reasons.push(`${adminCount} site admin(s)`);

      return NextResponse.json(
        {
          error: 'Cannot delete school with active dependencies',
          canDelete: false,
          blockerReason: `This school has ${reasons.join(', ')} assigned. Remove them first before deleting the school.`,
          dependencyCounts: [
            { label: 'Teachers', count: teacherCount },
            { label: 'Providers', count: providerCount },
            { label: 'Students', count: studentCount },
            { label: 'Site Admins', count: adminCount },
          ],
        },
        { status: 409 }
      );
    }

    log.info('District admin deleting school', {
      schoolId,
      deletedBy: user.id,
    });

    // Delete the school
    const { error: deleteError } = await adminClient
      .from('schools')
      .delete()
      .eq('id', schoolId);

    if (deleteError) {
      log.error('Failed to delete school', deleteError);
      return NextResponse.json(
        { error: deleteError.message || 'Failed to delete school' },
        { status: 500 }
      );
    }

    log.info('School deleted successfully', {
      schoolId,
      deletedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'School deleted successfully',
    });
  } catch (error) {
    log.error('Unexpected error in school delete', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/admin/district/schools/[schoolId]/deletable
 * Check if a school can be deleted (used by frontend before showing delete modal)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { schoolId } = params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, schoolId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client for checks
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check for dependencies
    const [teachersResult, providersResult, studentsResult, adminsResult] = await Promise.all([
      adminClient.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      adminClient.from('provider_schools').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      adminClient.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      adminClient.from('admin_permissions').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    ]);

    const teacherCount = teachersResult.count || 0;
    const providerCount = providersResult.count || 0;
    const studentCount = studentsResult.count || 0;
    const adminCount = adminsResult.count || 0;

    const canDelete = teacherCount === 0 && providerCount === 0 && studentCount === 0 && adminCount === 0;

    let blockerReason: string | undefined;
    if (!canDelete) {
      const reasons: string[] = [];
      if (teacherCount > 0) reasons.push(`${teacherCount} teacher(s)`);
      if (providerCount > 0) reasons.push(`${providerCount} provider(s)`);
      if (studentCount > 0) reasons.push(`${studentCount} student(s)`);
      if (adminCount > 0) reasons.push(`${adminCount} site admin(s)`);
      blockerReason = `This school has ${reasons.join(', ')} assigned. Remove them first before deleting the school.`;
    }

    return NextResponse.json({
      canDelete,
      blockerReason,
      dependencyCounts: [
        { label: 'Teachers', count: teacherCount },
        { label: 'Providers', count: providerCount },
        { label: 'Students', count: studentCount },
        { label: 'Site Admins', count: adminCount },
      ],
    });
  } catch (error) {
    log.error('Unexpected error checking school deletability', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
