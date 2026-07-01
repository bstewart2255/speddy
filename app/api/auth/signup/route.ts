import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types';
import { asyncHandler, ErrorFactory } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

// Roles a user is allowed to assign themselves through public self-signup.
// These are the provider roles offered by the signup form. Elevated roles
// (site_admin, district_admin), teacher, and sea accounts are provisioned only
// by an administrator via the admin flow, so they must never be self-assigned.
const SELF_REGISTERABLE_ROLES = new Set([
  'resource',
  'speech',
  'ot',
  'counseling',
  'specialist',
]);

export const POST = asyncHandler(async (request: NextRequest) => {
  const requestLogger = logger.child({ 
    endpoint: '/api/auth/signup',
    method: 'POST' 
  });
  
  const { email, password, metadata } = await request.json();
  requestLogger.info('Signup attempt started', { email });

  // Validate required fields
  if (!email || !password || !metadata) {
    throw ErrorFactory.validationError('Email, password, and metadata are required', {
      email: !email,
      password: !password,
      metadata: !metadata
    });
  }

  // Validate required metadata fields
  const requiredMetadata = ['full_name', 'role', 'state', 'school_district', 'school_site'];
  const missing = requiredMetadata.filter((field) => !metadata?.[field]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required metadata fields: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  // Enforce a server-side allow-list of self-registerable roles. The role from
  // the request body flows into both the `handle_new_user` trigger and the
  // `create_profile_for_new_user` RPC, so an unvalidated value would let a
  // direct POST self-assign an elevated role (e.g. site_admin/district_admin).
  // Validate here, before the auth user is created, so neither path can be
  // reached with a disallowed role. Admin-provisioned roles (sea, teacher,
  // site_admin, district_admin, etc.) are created through the admin flow only.
  const requestedRole = String(metadata.role).trim().toLowerCase();
  if (!SELF_REGISTERABLE_ROLES.has(requestedRole)) {
    return NextResponse.json(
      { error: 'This role cannot be self-registered. Please ask your district or site administrator to create your account.' },
      { status: 403 }
    );
  }
  // Use the normalized role from here on so the stored value is canonical.
  metadata.role = requestedRole;

    // Validate email domain (case-insensitive)
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain ||
        (!emailDomain.endsWith('.edu') &&
         !emailDomain.endsWith('.org') &&
         !emailDomain.includes('.k12.') &&
         !emailDomain.endsWith('.gov') &&
         !emailDomain.endsWith('.us'))) {
      return NextResponse.json(
        { error: 'Email must be from an educational institution (.edu, .org, .k12., .gov, or .us)' },
        { status: 400 }
      );
    }

    // Validate school site name
    if (typeof metadata.school_site !== 'string' ||
        metadata.school_site.trim().length < 5 ||
        !/\s/.test(metadata.school_site)) {
      return NextResponse.json(
        { error: 'Please enter your full school site name (no abbreviations - and spell correctly!)' },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Sign up the user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata.full_name,
          state: metadata.state,
          school_district: metadata.school_district,
          school_site: metadata.school_site,
          role: metadata.role,
          works_at_multiple_schools: metadata.works_at_multiple_schools || false,
          additional_schools: metadata.additional_schools || []
        },
      },
    });

    if (signUpError) {
      return NextResponse.json({ error: signUpError.message }, { status: 400 });
    }

    if (!signUpData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create profile record using the database function (use admin client to bypass RLS)
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { error: profileError } = await adminClient.rpc('create_profile_for_new_user', {
      user_id: signUpData.user.id,
      user_email: signUpData.user.email!,
      user_metadata: {
        full_name: metadata.full_name,
        role: metadata.role,
        state: metadata.state,
        school_district: metadata.school_district,
        school_site: metadata.school_site,
        works_at_multiple_schools: metadata.works_at_multiple_schools || false,
        additional_schools: metadata.additional_schools || []
      }
    });

    if (profileError) {
      requestLogger.error('Failed to create profile', profileError);
      
      // Clean up the auth user since profile creation failed
      try {
        // Use admin client for user deletion
        const adminClientForCleanup = createClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        
        const { error: deleteError } = await adminClientForCleanup.auth.admin.deleteUser(
          signUpData.user.id
        );
        
        if (deleteError) {
          requestLogger.error('Failed to clean up auth user after profile creation failure', deleteError);
        }
      } catch (cleanupError) {
        requestLogger.error('Error during auth user cleanup', cleanupError);
      }
      
      return NextResponse.json(
        { error: 'Failed to complete registration. Please try again.' },
        { status: 500 }
      );
    }

    requestLogger.info('Signup completed successfully', {
      userId: signUpData.user.id,
      email: signUpData.user.email,
      role: metadata.role
    });

    return NextResponse.json({
      user: signUpData.user,
      session: signUpData.session,
    });
});