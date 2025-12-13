import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { generateTemporaryPassword } from '@/lib/utils/password-generator';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'internal-create-admin' });

export async function POST(request: NextRequest) {
  try {
    // Get current user to verify they're a speddy admin
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify the user is a speddy admin
    // Note: is_speddy_admin column added via migration, cast to bypass type check until types regenerated
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_speddy_admin')
      .eq('id', user.id)
      .single() as unknown as { data: { is_speddy_admin: boolean } | null; error: Error | null };

    if (profileError || !profile?.is_speddy_admin) {
      log.warn('Non-speddy-admin tried to create admin account', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: Speddy admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, fullName, adminType, stateId, districtId, schoolId = null } = body as {
      email: string;
      fullName: string;
      adminType: string;
      stateId: string;
      districtId: string;
      schoolId: string | null;
    };

    // Validation
    if (!email || !fullName || !adminType || !stateId || !districtId) {
      return NextResponse.json(
        { error: 'Missing required fields: email, fullName, adminType, stateId, districtId' },
        { status: 400 }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Normalize email to lowercase for consistency
    const normalizedEmail = email.toLowerCase().trim();

    if (adminType !== 'district_admin' && adminType !== 'site_admin') {
      return NextResponse.json(
        { error: 'Invalid admin type. Must be district_admin or site_admin' },
        { status: 400 }
      );
    }

    if (adminType === 'site_admin' && !schoolId) {
      return NextResponse.json(
        { error: 'School ID is required for site_admin' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Get district and school names for the profile
    const { data: district } = await adminClient
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .single();

    let schoolName: string | null = null;
    if (schoolId) {
      const { data: school } = await adminClient
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .single();
      schoolName = school?.name ?? null;
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();

    log.info('Creating admin account', {
      email: normalizedEmail,
      adminType,
      districtId,
      schoolId,
      createdBy: user.id
    });

    // Create auth user using admin API (this skips email confirmation)
    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: temporaryPassword,
      email_confirm: true, // Mark email as confirmed
      user_metadata: {
        full_name: fullName,
        role: adminType,
        state: stateId,
        school_district: district?.name || districtId,
        school_site: schoolName || district?.name || districtId,
      }
    });

    if (createUserError || !newUser.user) {
      log.error('Failed to create auth user', createUserError);
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    const newUserId = newUser.user.id;

    try {
      // Create profile using RPC
      const { error: profileRpcError } = await adminClient.rpc('create_profile_for_new_user', {
        user_id: newUserId,
        user_email: normalizedEmail,
        user_metadata: {
          full_name: fullName,
          role: adminType,
          state: stateId,
          school_district: district?.name || districtId,
          school_site: schoolName || district?.name || districtId,
          works_at_multiple_schools: false,
          additional_schools: []
        }
      });

      if (profileRpcError) {
        throw new Error(`Profile creation failed: ${profileRpcError.message}`);
      }

      // Update profile with correct NCES IDs
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({
          state_id: stateId,
          district_id: districtId,
          school_id: adminType === 'site_admin' ? schoolId : null,
        })
        .eq('id', newUserId);

      if (updateError) {
        log.warn('Failed to update profile with NCES IDs', { error: updateError });
        // Non-fatal - profile was still created
      }

      // Create admin_permissions record
      const { error: permissionsError } = await adminClient
        .from('admin_permissions')
        .insert({
          admin_id: newUserId,
          role: adminType,
          state_id: stateId,
          district_id: districtId,
          school_id: adminType === 'site_admin' ? schoolId : null,
          granted_by: user.id,
        });

      if (permissionsError) {
        throw new Error(`Admin permissions creation failed: ${permissionsError.message}`);
      }

      log.info('Admin account created successfully', {
        newUserId,
        email: normalizedEmail,
        adminType,
        createdBy: user.id
      });

      return NextResponse.json({
        success: true,
        email: normalizedEmail,
        fullName,
        temporaryPassword,
        adminType,
        userId: newUserId
      });

    } catch (error) {
      // Rollback: delete the auth user if profile/permissions creation failed
      log.error('Error during admin creation, rolling back', error);

      try {
        await adminClient.auth.admin.deleteUser(newUserId);
        log.info('Rolled back auth user after failure', { userId: newUserId });
      } catch (rollbackError) {
        log.error('Failed to rollback auth user', rollbackError);
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create admin account' },
        { status: 500 }
      );
    }

  } catch (error) {
    log.error('Unexpected error in create-admin-account', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
