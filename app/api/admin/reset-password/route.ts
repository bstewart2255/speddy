import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTemporaryPassword } from '@/lib/utils/password-generator';
import { log } from '@/lib/monitoring/logger';

/**
 * Admin API endpoint to reset a user's password
 *
 * This endpoint:
 * 1. Verifies the requesting user is a site_admin for the target user's school
 * 2. Generates a secure temporary password
 * 3. Updates the user's password via Supabase Admin API
 * 4. Returns the generated password to display to admin (once only)
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
    const { userId } = body;

    // Validate required fields
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    // Get the target user's profile to determine their school
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, school_id, role')
      .eq('id', userId)
      .single();

    if (profileError || !targetProfile) {
      log.warn('Password reset attempted for non-existent user', {
        adminId: user.id,
        targetUserId: userId,
      });
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify the requesting user has site_admin role for the target user's school
    const { data: adminPermission, error: permError } = await supabase
      .from('admin_permissions')
      .select('role, school_id')
      .eq('admin_id', user.id)
      .eq('school_id', targetProfile.school_id)
      .eq('role', 'site_admin')
      .maybeSingle();

    if (permError || !adminPermission) {
      log.warn('Unauthorized password reset attempt', {
        adminId: user.id,
        targetUserId: userId,
        targetSchoolId: targetProfile.school_id,
      });
      return NextResponse.json(
        { error: 'Unauthorized - You must be a site admin for this user\'s school' },
        { status: 403 }
      );
    }

    // Prevent admins from resetting their own password via this endpoint
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot reset your own password through this endpoint. Use the account settings instead.' },
        { status: 400 }
      );
    }

    // Create admin client with service role key for privileged operations
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate secure temporary password
    const temporaryPassword = generateTemporaryPassword();

    // Update the user's password via Admin API
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password: temporaryPassword }
    );

    if (updateError) {
      log.error('Failed to reset password via admin API', updateError, {
        adminId: user.id,
        targetUserId: userId,
      });
      return NextResponse.json(
        { error: 'Failed to reset password' },
        { status: 500 }
      );
    }

    // Log the successful password reset
    log.info('Password reset by admin', {
      adminId: user.id,
      adminEmail: user.email,
      targetUserId: userId,
      targetEmail: targetProfile.email,
      targetRole: targetProfile.role,
    });

    // Success! Return the credentials
    return NextResponse.json({
      success: true,
      credentials: {
        email: targetProfile.email,
        temporaryPassword, // Only shown once, never stored
        fullName: targetProfile.full_name,
      },
    });
  } catch (error) {
    log.error('Unexpected error in reset-password:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
