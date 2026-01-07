import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validatePassword } from '@/lib/utils/password-validation';
import { log } from '@/lib/monitoring/logger';

/**
 * API endpoint for users to change their password after admin reset.
 * This endpoint:
 * 1. Verifies the user is authenticated
 * 2. Validates the new password meets requirements
 * 3. Updates the password via Supabase Auth
 * 4. Clears the must_change_password flag
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Validate password meets requirements
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.errors.join('. ') },
        { status: 400 }
      );
    }

    // Verify user has must_change_password flag set
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single();

    if (profileError) {
      log.error('Failed to fetch profile for password change', profileError, {
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to verify user status' },
        { status: 500 }
      );
    }

    if (!profile?.must_change_password) {
      return NextResponse.json(
        { error: 'Password change not required' },
        { status: 400 }
      );
    }

    // Update the password via Supabase Auth
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      log.error('Failed to update password', updateError, {
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    // Clear the must_change_password flag
    const { error: clearFlagError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);

    if (clearFlagError) {
      // Log but don't fail - password was already changed successfully
      log.warn('Failed to clear must_change_password flag', {
        userId: user.id,
        error: clearFlagError.message,
      });
    }

    log.info('User changed password successfully', {
      userId: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Unexpected error in change-password:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
