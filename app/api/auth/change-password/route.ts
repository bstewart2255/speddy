import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { validatePassword } from '@/lib/utils/password-validation';
import { log } from '@/lib/monitoring/logger';
import { withRoute } from '@/lib/api/with-route';

const bodySchema = z.object({ password: z.string().min(1) }).passthrough();

/**
 * Supabase auth failures the person at the keyboard can actually fix, in our
 * own words.
 *
 * Deliberately a small allow-list rather than passing Supabase's message
 * through. Upstream copy is written for developers ("New password should be
 * different from the old password"), can change between releases without us
 * noticing, and echoing arbitrary auth-server text to a browser is a habit
 * worth not forming. Anything absent from this map stays generic.
 */
const USER_FIXABLE_AUTH_ERRORS: Record<string, string> = {
  same_password:
    'Your new password must be different from the temporary one you were given. Please choose a different password.',
  weak_password:
    'That password is not strong enough. Try making it longer, or adding numbers and symbols.',
};

/**
 * API endpoint for users to change their password after admin reset.
 * This endpoint:
 * 1. Verifies the user is authenticated
 * 2. Validates the new password meets requirements
 * 3. Updates the password via Supabase Auth
 * 4. Clears the must_change_password flag
 */
export const POST = withRoute({ body: bodySchema }, async ({ userId, body }) => {
  try {
    const supabase = await createClient();
    const { password } = body;

    // Validate password meets requirements
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.errors.join('. ') }, { status: 400 });
    }

    // Verify user has must_change_password flag set
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', userId)
      .single();

    if (profileError) {
      log.error('Failed to fetch profile for password change', profileError, { userId });
      return NextResponse.json({ error: 'Failed to verify user status' }, { status: 500 });
    }

    if (!profile?.must_change_password) {
      return NextResponse.json({ error: 'Password change not required' }, { status: 400 });
    }

    // Update the password via Supabase Auth
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      // Supabase answers with a typed code here, and this handler used to throw
      // it away: every refusal became "Failed to update password" with a 500.
      //
      // Two costs, both real. Someone who retyped the temporary password they
      // were just given — a very natural thing to do on a screen headed "Change
      // Your Password" — was told nothing about what was wrong, on the FIRST
      // screen every admin-created account sees. And a person choosing a
      // password we decline is not a server fault, so each attempt was filed in
      // error monitoring as though Speddy had broken.
      const friendly = USER_FIXABLE_AUTH_ERRORS[updateError.code ?? ''];
      if (friendly) {
        log.info('Password change refused for a user-fixable reason', {
          userId,
          code: updateError.code,
        });
        return NextResponse.json({ error: friendly }, { status: 400 });
      }

      // Anything we do not recognise keeps the old behaviour: say nothing
      // specific and treat it as ours to investigate. Never pass an upstream
      // auth message through verbatim.
      log.error('Failed to update password', updateError, { userId, code: updateError.code });
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    // Clear the must_change_password flag using a service-role client.
    // updateUser() above rotates the user's session tokens; reusing the
    // request-scoped (user) client here stalls on a token refresh against the
    // now-stale session and hangs the request indefinitely (SPE-280). The
    // service client carries no session, so it completes cleanly.
    // Wrapped so a service-client/config failure here cannot 500 the request
    // after the password was already changed — same "log but don't fail" intent
    // as the query error below (the password change is the important part).
    try {
      const serviceClient = createServiceClient();
      const { error: clearFlagError } = await serviceClient
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', userId);

      if (clearFlagError) {
        // Log but don't fail - password was already changed successfully
        log.warn('Failed to clear must_change_password flag', {
          userId,
          error: clearFlagError.message,
        });
      }
    } catch (clientError) {
      // Log but don't fail - password was already changed successfully
      log.warn('Failed to create service client to clear must_change_password flag', {
        userId,
        error: clientError instanceof Error ? clientError.message : String(clientError),
      });
    }

    log.info('User changed password successfully', { userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Unexpected error in change-password:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
});
