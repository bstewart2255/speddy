import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTemporaryPassword } from '@/lib/utils/password-generator';

/**
 * Admin API endpoint to create a teacher account with login credentials
 *
 * This endpoint:
 * 1. Verifies the requesting user is a site_admin for the target school
 * 2. Generates a secure temporary password
 * 3. Creates an auth user via Supabase Admin API
 * 4. Creates a profile record
 * 5. Creates a teacher record linked to the profile
 * 6. Returns the generated password to display to admin (once only)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the requesting user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - You must be logged in' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      first_name,
      last_name,
      email,
      classroom_number,
      phone_number,
      school_id,
      school_site,
    } = body;

    // Validate required fields
    if (!first_name || !last_name || !email || !school_id) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, last_name, email, school_id' },
        { status: 400 }
      );
    }

    // Verify the user has site_admin role for this school
    const { data: adminPermission, error: permError } = await supabase
      .from('admin_permissions')
      .select('role, school_id')
      .eq('admin_id', user.id)
      .eq('school_id', school_id)
      .eq('role', 'site_admin')
      .single();

    if (permError || !adminPermission) {
      return NextResponse.json(
        { error: 'Unauthorized - You must be a site admin for this school' },
        { status: 403 }
      );
    }

    // Check for duplicate teacher at this school
    const { data: existingTeacher } = await supabase
      .from('teachers')
      .select('id')
      .eq('school_id', school_id)
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existingTeacher) {
      return NextResponse.json(
        { error: 'A teacher with this email already exists at this school' },
        { status: 409 }
      );
    }

    // Create admin client with service role key for privileged operations
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate secure temporary password
    const temporaryPassword = generateTemporaryPassword();

    // Create auth user via Admin API
    const { data: authUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: temporaryPassword,
      email_confirm: true, // Skip email confirmation since admin is creating the account
      user_metadata: {
        full_name: `${first_name} ${last_name}`,
        role: 'teacher',
        created_by_admin: true,
      },
    });

    if (createUserError || !authUser.user) {
      console.error('Failed to create auth user:', createUserError);
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
          full_name: `${first_name} ${last_name}`,
          role: 'teacher',
          school_site: school_site || '',
          school_district: '', // Teachers don't set this during creation
          state: '', // Teachers don't set this during creation
          works_at_multiple_schools: false,
          additional_schools: [],
        },
      });

      if (profileError) {
        throw new Error(`Profile creation failed: ${profileError.message}`);
      }

      // Create teacher record linked to the auth account
      const { data: teacher, error: teacherError } = await adminClient
        .from('teachers')
        .insert({
          account_id: authUser.user.id, // Link to the auth account
          school_id,
          school_site: school_site || null,
          first_name,
          last_name,
          email: email.toLowerCase().trim(),
          classroom_number: classroom_number || null,
          phone_number: phone_number || null,
          created_by_admin: true,
        })
        .select()
        .single();

      if (teacherError) {
        throw new Error(`Teacher record creation failed: ${teacherError.message}`);
      }

      // Success! Return the teacher data and temporary password
      return NextResponse.json({
        success: true,
        teacher,
        credentials: {
          email: email.toLowerCase().trim(),
          temporaryPassword, // Only shown once, never stored
        },
      });
    } catch (rollbackError) {
      // Rollback: Delete the auth user if profile or teacher creation failed
      console.error('Rolling back auth user creation:', rollbackError);

      await adminClient.auth.admin.deleteUser(authUser.user.id);

      return NextResponse.json(
        { error: rollbackError instanceof Error ? rollbackError.message : 'Failed to complete account creation' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Unexpected error in create-teacher-account:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
