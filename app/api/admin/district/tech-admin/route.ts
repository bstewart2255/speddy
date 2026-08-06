import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateTemporaryPassword } from '@/lib/utils/password-generator';
import { withRoute } from '@/lib/api/with-route';

const log = logger.child({ module: 'district-admin-tech-admin' });

/**
 * POST /api/admin/district/tech-admin
 *
 * Create a District Tech Admin (`district_tech`) for the caller's district —
 * the account a district's IT contact uses to connect Aeries / OneRoster.
 *
 * Mirrors ../site-admin/route.ts, with two deliberate differences:
 *
 *  1. NO SCHOOL. This role is district-scoped, so there is no school to resolve
 *     the grant from. A caller holding several district grants must name the
 *     target district explicitly; one grant is defaulted. The district is always
 *     validated against the caller's own grants — the body never widens scope.
 *  2. `must_change_password` is set at creation. The other admin-creation flows
 *     hand out a temp password that is never force-rotated (SPE-190 / SPE-364);
 *     this one does not inherit that gap.
 */
export const POST = withRoute({}, async ({ req: request, userId }) => {
  try {
    const supabase = await createClient();

    // Holding more than one admin_permissions row is legal, so read the full
    // set rather than .single(), which errors outright on 2+ rows and would 403
    // a legitimately multi-district admin.
    const { data: adminPermissions, error: permError } = await supabase
      .from('admin_permissions')
      .select('district_id, state_id')
      .eq('admin_id', userId)
      .eq('role', 'district_admin')
      .not('district_id', 'is', null);

    if (permError || !adminPermissions?.length) {
      log.warn('Non-district-admin tried to create tech admin', { userId });
      return NextResponse.json(
        { error: 'Forbidden: District admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { first_name, last_name, email, district_id } = body as {
      first_name: string;
      last_name: string;
      email: string;
      district_id?: string;
    };

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, last_name, email' },
        { status: 400 }
      );
    }

    // Resolve which district this account belongs to. Only ever one of the
    // caller's own grants — a district_id in the body selects among them, it
    // never introduces a new one.
    let grant;
    if (district_id) {
      grant = adminPermissions.find((p) => p.district_id === district_id);
      if (!grant) {
        log.warn('District admin tried to create tech admin outside their district', {
          userId,
          requestedDistrict: district_id,
          adminDistricts: adminPermissions.map((p) => p.district_id),
        });
        return NextResponse.json(
          { error: 'District is not one you administer' },
          { status: 403 }
        );
      }
    } else if (adminPermissions.length === 1) {
      grant = adminPermissions[0];
    } else {
      return NextResponse.json(
        { error: 'district_id is required when you administer multiple districts' },
        { status: 400 }
      );
    }

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

    const adminClient = createServiceClient();

    const { data: district, error: districtError } = await adminClient
      .from('districts')
      .select('id, name, state_id')
      .eq('id', grant.district_id!)
      .single();

    if (districtError || !district) {
      log.error('District lookup failed for tech admin creation', districtError);
      return NextResponse.json({ error: 'District not found' }, { status: 404 });
    }

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

    const temporaryPassword = generateTemporaryPassword();
    const fullName = `${first_name.trim()} ${last_name.trim()}`;

    log.info('District admin creating tech admin', {
      districtId: district.id,
      districtName: district.name,
      email: trimmedEmail,
      createdBy: userId,
    });

    const { data: authUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: trimmedEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'district_tech',
        created_by_admin: true,
      },
    });

    if (createUserError || !authUser.user) {
      log.error('Failed to create auth user for tech admin', createUserError);
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create auth account' },
        { status: 500 }
      );
    }

    try {
      const { error: profileError } = await adminClient.rpc('create_profile_for_new_user', {
        user_id: authUser.user.id,
        user_email: authUser.user.email!,
        user_metadata: {
          full_name: fullName,
          role: 'district_tech',
          school_site: '',
          school_district: district.name,
          state: '',
          works_at_multiple_schools: false,
          additional_schools: [],
        },
      });

      if (profileError) {
        throw new Error(`Profile creation failed: ${profileError.message}`);
      }

      // The RPC resolves scope by fuzzy NAME matching (find_school_ids_by_names).
      // Pin the authoritative ids from the caller's grant instead of trusting
      // that match, and force the temp password to be rotated at first login.
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({
          district_id: grant.district_id,
          state_id: grant.state_id,
          school_id: null,
          must_change_password: true,
        })
        .eq('id', authUser.user.id);

      if (updateError) {
        throw new Error(`Profile scoping update failed: ${updateError.message}`);
      }

      // Both CHECK constraints on admin_permissions must be satisfied:
      // the role enum, and the pairing rule (district_tech => district_id NOT NULL).
      const { error: permissionError } = await adminClient
        .from('admin_permissions')
        .insert({
          admin_id: authUser.user.id,
          role: 'district_tech',
          school_id: null,
          district_id: grant.district_id,
          state_id: grant.state_id,
        });

      if (permissionError) {
        throw new Error(`Admin permission creation failed: ${permissionError.message}`);
      }

      log.info('Tech admin created successfully', {
        techAdminId: authUser.user.id,
        districtId: district.id,
        createdBy: userId,
      });

      return NextResponse.json({
        success: true,
        techAdmin: {
          id: authUser.user.id,
          email: trimmedEmail,
          full_name: fullName,
          district_id: grant.district_id,
        },
        credentials: {
          email: trimmedEmail,
          temporaryPassword,
        },
      });
    } catch (rollbackError) {
      log.error('Rolling back tech admin auth user creation', rollbackError);

      await adminClient.auth.admin.deleteUser(authUser.user.id);

      return NextResponse.json(
        {
          error:
            rollbackError instanceof Error
              ? rollbackError.message
              : 'Failed to complete account creation',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error('Unexpected error in create tech admin', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
