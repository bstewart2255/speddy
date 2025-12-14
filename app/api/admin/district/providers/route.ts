import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { logger } from '@/lib/logger';
import { generateTemporaryPassword } from '@/lib/utils/password-generator';

const log = logger.child({ module: 'district-admin-providers' });

type ProviderRole = 'resource' | 'speech' | 'ot' | 'counseling' | 'sea';

interface CreateProviderRequest {
  first_name: string;
  last_name: string;
  email: string;
  role: ProviderRole;
  school_ids: string[];
  primary_school_id: string;
}

/**
 * POST /api/admin/district/providers
 * Create a new provider account for schools in the district admin's district
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
      log.warn('Non-district-admin tried to create provider', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: District admin access required' },
        { status: 403 }
      );
    }

    const districtId = adminPermission.district_id;

    // Parse request body
    const body: CreateProviderRequest = await request.json();
    const { first_name, last_name, email, role, school_ids, primary_school_id } = body;

    // Validate required fields
    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !role || !school_ids?.length || !primary_school_id) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, last_name, email, role, school_ids, primary_school_id' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles: ProviderRole[] = ['resource', 'speech', 'ot', 'counseling', 'sea'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
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

    // Verify all schools belong to admin's district
    const { data: schools, error: schoolsError } = await adminClient
      .from('schools')
      .select('id, district_id, name')
      .in('id', school_ids);

    if (schoolsError || !schools || schools.length !== school_ids.length) {
      return NextResponse.json({ error: 'One or more schools not found' }, { status: 404 });
    }

    const invalidSchools = schools.filter(s => s.district_id !== districtId);
    if (invalidSchools.length > 0) {
      log.warn('District admin tried to assign provider to school outside district', {
        userId: user.id,
        invalidSchools: invalidSchools.map(s => s.id),
      });
      return NextResponse.json(
        { error: 'One or more schools are not in your district' },
        { status: 403 }
      );
    }

    // Validate primary_school_id is in school_ids
    if (!school_ids.includes(primary_school_id)) {
      return NextResponse.json(
        { error: 'Primary school must be one of the assigned schools' },
        { status: 400 }
      );
    }

    // Check if email already exists
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
    const fullName = `${first_name.trim()} ${last_name.trim()}`;
    const primarySchool = schools.find(s => s.id === primary_school_id);

    log.info('District admin creating provider', {
      email: trimmedEmail,
      role,
      schoolIds: school_ids,
      primarySchoolId: primary_school_id,
      createdBy: user.id,
    });

    // Create auth user
    const { data: authUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: trimmedEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
        created_by_admin: true,
      },
    });

    if (createUserError || !authUser.user) {
      log.error('Failed to create auth user for provider', createUserError);
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
          full_name: fullName,
          role,
          school_site: primarySchool?.name || '',
          school_district: '',
          state: '',
          works_at_multiple_schools: school_ids.length > 1,
          additional_schools: [],
        },
      });

      if (profileError) {
        throw new Error(`Profile creation failed: ${profileError.message}`);
      }

      // Update profile with IDs
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({
          school_id: primary_school_id,
          district_id: districtId,
          state_id: adminPermission.state_id,
        })
        .eq('id', authUser.user.id);

      if (updateError) {
        throw new Error(`Profile update failed: ${updateError.message}`);
      }

      // Create provider_schools entries
      const providerSchoolsData = school_ids.map(schoolId => {
        const school = schools.find(s => s.id === schoolId);
        return {
          provider_id: authUser.user.id,
          school_id: schoolId,
          school_site: school?.name || '',
          school_district: '',
          is_primary: schoolId === primary_school_id,
          district_id: districtId,
          state_id: adminPermission.state_id,
        };
      });

      const { error: providerSchoolsError } = await adminClient
        .from('provider_schools')
        .insert(providerSchoolsData);

      if (providerSchoolsError) {
        throw new Error(`Provider schools creation failed: ${providerSchoolsError.message}`);
      }

      log.info('Provider created successfully', {
        providerId: authUser.user.id,
        email: trimmedEmail,
        role,
        schoolCount: school_ids.length,
        createdBy: user.id,
      });

      return NextResponse.json({
        success: true,
        provider: {
          id: authUser.user.id,
          email: trimmedEmail,
          full_name: fullName,
          role,
          school_ids,
          primary_school_id,
        },
        credentials: {
          email: trimmedEmail,
          temporaryPassword,
        },
      });
    } catch (rollbackError) {
      // Rollback: Delete the auth user if profile or provider_schools creation failed
      log.error('Rolling back provider auth user creation', rollbackError);

      await adminClient.auth.admin.deleteUser(authUser.user.id);

      return NextResponse.json(
        { error: rollbackError instanceof Error ? rollbackError.message : 'Failed to complete account creation' },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error('Unexpected error in create provider', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
