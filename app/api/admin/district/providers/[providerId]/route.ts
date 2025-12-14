import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

const log = logger.child({ module: 'district-admin-provider' });

interface RouteParams {
  params: { providerId: string };
}

/**
 * Helper to verify district admin has access to the provider
 */
async function verifyDistrictAdminAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  providerId: string
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

  // Use admin client to verify the provider is in the district admin's district
  const adminClient = createServiceClient();

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('district_id, role')
    .eq('id', providerId)
    .single();

  if (profileError || !profile) {
    return { allowed: false, error: 'Provider not found' };
  }

  // Check if it's a provider role
  const providerRoles = ['resource', 'speech', 'ot', 'counseling', 'sea'];
  if (!providerRoles.includes(profile.role || '')) {
    return { allowed: false, error: 'User is not a provider' };
  }

  if (profile.district_id !== adminPermission.district_id) {
    return { allowed: false, error: 'Provider is not in your district' };
  }

  return { allowed: true, districtId: adminPermission.district_id };
}

/**
 * GET /api/admin/district/providers/[providerId]
 * Get provider details including deletability check
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { providerId } = params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, providerId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client for queries
    const adminClient = createServiceClient();

    // Get provider profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', providerId)
      .single();

    // Get provider schools
    const { data: providerSchools } = await adminClient
      .from('provider_schools')
      .select('school_id, is_primary, schools (id, name)')
      .eq('provider_id', providerId);

    // Check for dependencies
    const [studentsResult, sessionsResult] = await Promise.all([
      adminClient
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId),
      adminClient
        .from('schedule_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId),
    ]);

    const studentCount = studentsResult.count || 0;
    const sessionCount = sessionsResult.count || 0;
    const canDelete = studentCount === 0 && sessionCount === 0;

    let blockerReason: string | undefined;
    if (!canDelete) {
      const reasons: string[] = [];
      if (studentCount > 0) reasons.push(`${studentCount} student(s)`);
      if (sessionCount > 0) reasons.push(`${sessionCount} session(s)`);
      blockerReason = `This provider has ${reasons.join(' and ')} assigned. Reassign them before removing the provider.`;
    }

    return NextResponse.json({
      provider: {
        id: profile?.id,
        full_name: profile?.full_name,
        email: profile?.email,
        role: profile?.role,
        schools: providerSchools?.map(ps => ({
          id: ps.school_id,
          name: (ps.schools as any)?.name,
          is_primary: ps.is_primary,
        })) || [],
      },
      canDelete,
      blockerReason,
      dependencyCounts: [
        { label: 'Students', count: studentCount },
        { label: 'Sessions', count: sessionCount },
      ],
    });
  } catch (error) {
    log.error('Unexpected error fetching provider', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/district/providers/[providerId]
 * Update provider profile and school assignments
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { providerId } = params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, providerId);
    if (!accessCheck.allowed) {
      log.warn('District admin access denied for provider update', {
        userId: user.id,
        providerId,
        reason: accessCheck.error,
      });
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    const body = await request.json();
    const { full_name, school_ids, primary_school_id } = body as {
      full_name?: string;
      school_ids?: string[];
      primary_school_id?: string;
    };

    // Use admin client for updates
    const adminClient = createServiceClient();

    // Update profile if name changed
    if (full_name !== undefined) {
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({ full_name: full_name.trim() })
        .eq('id', providerId);

      if (updateError) {
        log.error('Failed to update provider profile', updateError);
        return NextResponse.json(
          { error: updateError.message || 'Failed to update provider' },
          { status: 500 }
        );
      }
    }

    // Update school assignments if changed
    if (school_ids && primary_school_id) {
      // Verify all schools are in admin's district
      const { data: schools, error: schoolsError } = await adminClient
        .from('schools')
        .select('id, district_id, name')
        .in('id', school_ids);

      if (schoolsError || !schools || schools.length !== school_ids.length) {
        return NextResponse.json({ error: 'One or more schools not found' }, { status: 404 });
      }

      const invalidSchools = schools.filter(s => s.district_id !== accessCheck.districtId);
      if (invalidSchools.length > 0) {
        return NextResponse.json(
          { error: 'One or more schools are not in your district' },
          { status: 403 }
        );
      }

      if (!school_ids.includes(primary_school_id)) {
        return NextResponse.json(
          { error: 'Primary school must be one of the assigned schools' },
          { status: 400 }
        );
      }

      // Fetch existing provider_schools for rollback if needed
      const { data: existingProviderSchools } = await adminClient
        .from('provider_schools')
        .select('*')
        .eq('provider_id', providerId);

      // Delete existing provider_schools
      const { error: deleteError } = await adminClient
        .from('provider_schools')
        .delete()
        .eq('provider_id', providerId);

      if (deleteError) {
        log.error('Failed to delete existing provider schools', deleteError);
        return NextResponse.json(
          { error: 'Failed to update school assignments' },
          { status: 500 }
        );
      }

      // Insert new provider_schools
      const providerSchoolsData = school_ids.map(schoolId => {
        const school = schools.find(s => s.id === schoolId);
        return {
          provider_id: providerId,
          school_id: schoolId,
          school_site: school?.name || '',
          school_district: '',
          is_primary: schoolId === primary_school_id,
          district_id: accessCheck.districtId!,
        };
      });

      const { error: insertError } = await adminClient
        .from('provider_schools')
        .insert(providerSchoolsData);

      if (insertError) {
        log.error('Failed to insert provider schools, rolling back', insertError);

        // Rollback: restore the original provider_schools
        if (existingProviderSchools && existingProviderSchools.length > 0) {
          const rollbackData = existingProviderSchools.map(ps => ({
            provider_id: ps.provider_id,
            school_id: ps.school_id,
            school_site: ps.school_site,
            school_district: ps.school_district,
            is_primary: ps.is_primary,
            district_id: ps.district_id,
            state_id: ps.state_id,
          }));
          await adminClient.from('provider_schools').insert(rollbackData);
        }

        return NextResponse.json(
          { error: insertError.message || 'Failed to update school assignments' },
          { status: 500 }
        );
      }

      // Update primary school on profile
      await adminClient
        .from('profiles')
        .update({
          school_id: primary_school_id,
          works_at_multiple_schools: school_ids.length > 1,
        })
        .eq('id', providerId);
    }

    log.info('Provider updated successfully', {
      providerId,
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Provider updated successfully',
    });
  } catch (error) {
    log.error('Unexpected error in provider update', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/district/providers/[providerId]
 * Remove provider (soft delete - removes permissions and deactivates)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { providerId } = params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify access
    const accessCheck = await verifyDistrictAdminAccess(supabase, user.id, providerId);
    if (!accessCheck.allowed) {
      log.warn('District admin access denied for provider removal', {
        userId: user.id,
        providerId,
        reason: accessCheck.error,
      });
      return NextResponse.json({ error: accessCheck.error }, { status: 403 });
    }

    // Use admin client for checks and delete
    const adminClient = createServiceClient();

    // Check for active dependencies
    const [studentsResult, sessionsResult] = await Promise.all([
      adminClient
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId),
      adminClient
        .from('schedule_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', providerId),
    ]);

    const studentCount = studentsResult.count || 0;
    const sessionCount = sessionsResult.count || 0;

    if (studentCount > 0 || sessionCount > 0) {
      const reasons: string[] = [];
      if (studentCount > 0) reasons.push(`${studentCount} student(s)`);
      if (sessionCount > 0) reasons.push(`${sessionCount} session(s)`);

      return NextResponse.json(
        {
          error: 'Cannot remove provider with active dependencies',
          canDelete: false,
          blockerReason: `This provider has ${reasons.join(' and ')} assigned. Reassign them first.`,
          dependencyCounts: [
            { label: 'Students', count: studentCount },
            { label: 'Sessions', count: sessionCount },
          ],
        },
        { status: 409 }
      );
    }

    log.info('District admin removing provider', {
      providerId,
      removedBy: user.id,
    });

    // Delete provider_schools entries
    await adminClient
      .from('provider_schools')
      .delete()
      .eq('provider_id', providerId);

    // Clear the provider's district/school associations (soft delete approach)
    await adminClient
      .from('profiles')
      .update({
        school_id: null,
        district_id: null,
      })
      .eq('id', providerId);

    log.info('Provider removed successfully', {
      providerId,
      removedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Provider removed successfully',
    });
  } catch (error) {
    log.error('Unexpected error in provider removal', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
