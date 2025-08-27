import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { asyncHandler, ErrorFactory } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

// Teacher roles that should receive referral codes
const TEACHER_ROLES = ['resource', 'speech', 'ot', 'counseling', 'specialist'] as const;

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

    // Validate email domain
    const emailDomain = email.split('@')[1];
    if (!emailDomain || 
        (!emailDomain.endsWith('.edu') && 
         !emailDomain.endsWith('.org') && 
         !emailDomain.includes('.k12.') && 
         !emailDomain.endsWith('.gov'))) {
      return NextResponse.json(
        { error: 'Email must be from an educational institution (.edu, .org, .k12., or .gov)' },
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

    // Create profile record using the database function
    const { error: profileError } = await supabase.rpc('create_profile_for_new_user', {
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
        // We need to use a service role client for admin operations
        const serviceRoleClient = createRouteHandlerClient<Database>(
          { cookies: () => cookieStore },
          {
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
            supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          }
        );
        
        const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(
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

    // For SEA roles, verify that school IDs were populated
    if (metadata.role === 'sea') {
      const { data: profile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('school_id, district_id, state_id')
        .eq('id', signUpData.user.id)
        .single();

      if (!profileCheckError && profile) {
        if (!profile.school_id || !profile.district_id || !profile.state_id) {
          requestLogger.warn('SEA profile created without complete school IDs', {
            userId: signUpData.user.id,
            hasSchoolId: !!profile.school_id,
            hasDistrictId: !!profile.district_id,
            hasStateId: !!profile.state_id,
            state: metadata.state,
            district: metadata.school_district,
            school: metadata.school_site
          });
        }
      }
    }

    // For teacher roles, ensure referral code is generated
    if (TEACHER_ROLES.includes(metadata.role)) {
      // Check if referral code was automatically generated by the trigger
      const { data: referralCode, error: checkError } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', signUpData.user.id)
        .single();

      // If no referral code exists (trigger might have failed), generate one manually
      if (checkError || !referralCode) {
        const generateReferralCode = () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code = '';
          for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
          }
          return code;
        };

        // Try to generate a unique code
        let attempts = 0;
        let codeGenerated = false;
        
        while (!codeGenerated && attempts < 100) {
          attempts++;
          const newCode = generateReferralCode();
          
          // Check if code already exists
          const { data: existingCode } = await supabase
            .from('referral_codes')
            .select('code')
            .eq('code', newCode)
            .single();

          if (!existingCode) {
            // Insert the new code
            const { error: insertError } = await supabase
              .from('referral_codes')
              .insert({
                user_id: signUpData.user.id,
                code: newCode,
                uses_count: 0,
                created_at: new Date().toISOString(),
              });

            if (!insertError) {
              codeGenerated = true;
            }
          }
        }

        if (!codeGenerated) {
          requestLogger.error('Failed to generate referral code after 100 attempts', null, { userId: signUpData.user.id });
        }
      }
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