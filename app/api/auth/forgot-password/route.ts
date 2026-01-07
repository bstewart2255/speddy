import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/src/types/database';
import { log } from '@/lib/monitoring/logger';

/**
 * Public API endpoint for users who forgot their password.
 * Sets password_reset_requested_at flag so site admin sees the notification.
 *
 * Security: Always returns success to avoid revealing whether email exists.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      // Still return success to avoid revealing email validation
      return NextResponse.json({ success: true });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Create admin client with service role key (no auth required for this endpoint)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      log.error('Missing required environment variables for admin client', null);
      // Still return success to avoid revealing server issues
      return NextResponse.json({ success: true });
    }

    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

    // Look up user by email
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, password_reset_requested_at')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (profileError) {
      log.error('Error looking up profile for forgot password', profileError, { email: normalizedEmail });
      return NextResponse.json({ success: true });
    }

    // If no profile found, just return success (don't reveal email doesn't exist)
    if (!profile) {
      log.info('Forgot password request for non-existent email', { email: normalizedEmail });
      return NextResponse.json({ success: true });
    }

    // Only process for provider roles
    const providerRoles = ['resource', 'speech', 'ot', 'counseling', 'sea', 'psychologist', 'specialist'];
    if (!providerRoles.includes(profile.role || '')) {
      log.info('Forgot password request for non-provider role', { email: normalizedEmail, role: profile.role });
      return NextResponse.json({ success: true });
    }

    // If already has a pending request, don't update (avoid timestamp spam)
    if (profile.password_reset_requested_at) {
      log.info('Forgot password request already pending', { email: normalizedEmail });
      return NextResponse.json({ success: true });
    }

    // Set the password reset request timestamp
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ password_reset_requested_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (updateError) {
      log.error('Error setting password reset request', updateError, { email: normalizedEmail });
      return NextResponse.json({ success: true });
    }

    log.info('Password reset request set via forgot password', {
      userId: profile.id,
      email: normalizedEmail
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Unexpected error in forgot-password:', error);
    // Always return success to avoid revealing errors
    return NextResponse.json({ success: true });
  }
}
