import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import { generateTemporaryPassword } from '@/lib/utils/password-generator';

const log = logger.child({ module: 'district-admin-site-admin' });

/**
 * POST /api/admin/district/site-admin
 * Create a new site admin account for a school in the district admin's district
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

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
      log.warn('Non-district-admin tried to create site admin', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: District admin access required' },
        { status: 403 }
      );
    }

    const districtId = adminPermission.district_id;

    // Parse request body
    const body = await request.json();
    const { first_name, last_name, email, school_id } = body as {
      first_name: string;
      last_name: string;
      email: string;
      school_id: string;
    };

    // Validate required fields
    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !school_id) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, last_name, email, school_id' },
        { status: 400 }
      );
    }

    // Validate email format
    const trimmedEmail = email.trim().toLowerCase();
    const atIndex = trimmedEmail.indexOf('@');
    const lastDotIndex = trimmedEmail.lastIndexOf('.');

    if (
      atIndex === -1 ||
      atIndex === 0 ||
      atIndex === trimmedEmail.length - 1 ||
      lastDotIndex === -1 ||
      lastDotIndex < atIndex ||
      lastDotIndex === trimmedEmail.length - 1 ||
      trimmedEmail.includes(' ') ||
      trimmedEmail.length > 254
    ) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Use admin client for verification and operations
    const adminClient = createServiceClient();

    // Verify school belongs to admin's district
    const { data: school, error: schoolError } = await adminClient
      .from('schools')
      .select('id, district_id, name')
      .eq('id', school_id)
      .single();

    if (schoolError || !school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    if (school.district_id !== districtId) {
      log.warn('District admin tried to create site admin for school outside district', {
        userId: user.id,
        schoolId: school_id,
        adminDistrict: districtId,
        schoolDistrict: school.district_id,
      });
      return NextResponse.json(
        { error: 'School is not in your district' },
        { status: 403 }
      );
    }

    // Check if user already has site_admin permission for this school
    const { data: existingPermission, error: existingError } = await adminClient
      .from('admin_permissions')
      .select('id, admin_id')
      .eq('school_id', school_id)
      .eq('role', 'site_admin')
      .maybeSingle();

    if (existingPermission) {
      return NextResponse.json(
        { error: 'This school already has a site admin assigned' },
        { status: 409 }
      );
    }

    // Check if email already exists in auth
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === trimmedEmail
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Generate secure temporary password
    const temporaryPassword = generateTemporaryPassword();

    log.info('District admin creating site admin', {
      schoolId: school_id,
      schoolName: school.name,
      email: trimmedEmail,
      createdBy: user.id,
    });

    // Create auth user via Admin API
    const { data: authUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: trimmedEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${first_name.trim()} ${last_name.trim()}`,
        role: 'site_admin',
        created_by_admin: true,
      },
    });

    if (createUserError || !authUser.user) {
      log.error('Failed to create auth user for site admin', createUserError);
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create auth account' },
        { status: 500 }
      );
    }

    try {
      // Create profile record via RPC
      const { error: profileError } = await adminClient.rpc('create_profile_for_new_user', {
        user_id: authUser.user.id,
        user_email: authUser.user.email!,
        user_metadata: {
          full_name: `${first_name.trim()} ${last_name.trim()}`,
          role: 'site_admin',
          school_site: school.name,
          school_district: '',
          state: '',
          works_at_multiple_schools: false,
          additional_schools: [],
        },
      });

      if (profileError) {
        throw new Error(`Profile creation failed: ${profileError.message}`);
      }

      // Update profile with the school_id
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({ school_id })
        .eq('id', authUser.user.id);

      if (updateError) {
        throw new Error(`Profile school_id update failed: ${updateError.message}`);
      }

      // Create admin_permissions record for site_admin role
      const { error: permissionError } = await adminClient
        .from('admin_permissions')
        .insert({
          admin_id: authUser.user.id,
          role: 'site_admin',
          school_id,
          district_id: districtId,
          state_id: adminPermission.state_id,
        });

      if (permissionError) {
        throw new Error(`Admin permission creation failed: ${permissionError.message}`);
      }

      log.info('Site admin created successfully', {
        siteAdminId: authUser.user.id,
        schoolId: school_id,
        createdBy: user.id,
      });

      return NextResponse.json({
        success: true,
        siteAdmin: {
          id: authUser.user.id,
          email: trimmedEmail,
          full_name: `${first_name.trim()} ${last_name.trim()}`,
          school_id,
        },
        credentials: {
          email: trimmedEmail,
          temporaryPassword,
        },
      });
    } catch (rollbackError) {
      // Rollback: Delete the auth user if profile or permission creation failed
      log.error('Rolling back site admin auth user creation', rollbackError);

      await adminClient.auth.admin.deleteUser(authUser.user.id);

      return NextResponse.json(
        { error: rollbackError instanceof Error ? rollbackError.message : 'Failed to complete account creation' },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error('Unexpected error in create site admin', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
