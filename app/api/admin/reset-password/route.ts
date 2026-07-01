import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { Database } from '@/src/types';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTemporaryPassword } from '@/lib/utils/password-generator';
import { log } from '@/lib/monitoring/logger';
import { withRoute } from '@/lib/api/with-route';

/**
 * Admin API endpoint to reset a user's password
 *
 * This endpoint:
 * 1. Verifies the requesting user is a site_admin for the target user's school
 * 2. Generates a secure temporary password
 * 3. Updates the user's password via Supabase Admin API
 * 4. Returns the generated password to display to admin (once only)
 */
export const POST = withRoute({}, async ({ req: request, userId: adminId }) => {
  try {
    // Used for the site-admin permission check below
    const supabase = await createServerClient();

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
        adminId: adminId,
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
      .eq('admin_id', adminId)
      .eq('school_id', targetProfile.school_id)
      .eq('role', 'site_admin')
      .maybeSingle();

    if (permError || !adminPermission) {
      log.warn('Unauthorized password reset attempt', {
        adminId: adminId,
        targetUserId: userId,
        targetSchoolId: targetProfile.school_id,
      });
      return NextResponse.json(
        { error: 'Unauthorized - You must be a site admin for this user\'s school' },
        { status: 403 }
      );
    }

    // Prevent admins from resetting their own password via this endpoint
    if (userId === adminId) {
      return NextResponse.json(
        { error: 'You cannot reset your own password through this endpoint. Use the account settings instead.' },
        { status: 400 }
      );
    }

    // Create admin client with service role key for privileged operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      log.error('Missing required environment variables for admin client', null);
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const adminClient = createClient<Database>(
      supabaseUrl,
      serviceRoleKey
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
        adminId: adminId,
        targetUserId: userId,
      });
      return NextResponse.json(
        { error: 'Failed to reset password' },
        { status: 500 }
      );
    }

    // Update profile to require password change on next login and clear any pending request
    // Uses database function that enforces site_admin authorization and only updates password fields
    const { error: profileUpdateError } = await supabase.rpc('mark_password_reset', {
      target_user_id: userId,
    });

    if (profileUpdateError) {
      // Log but don't fail - password was already reset successfully
      log.warn('Failed to update must_change_password flag', {
        adminId: adminId,
        targetUserId: userId,
        error: profileUpdateError.message,
      });
    }

    // Log the successful password reset (excluding PII for GDPR/CCPA compliance)
    log.info('Password reset by admin', {
      adminId: adminId,
      targetUserId: userId,
      targetRole: targetProfile.role,
      targetSchoolId: targetProfile.school_id,
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
});
