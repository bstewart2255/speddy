import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { validatePassword } from '@/lib/utils/password-validation';
import { log } from '@/lib/monitoring/logger';
import { withRoute } from '@/lib/api/with-route';
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/password-reset';

const bodySchema = z.object({ password: z.string().min(1) }).passthrough();

/**
 * Completes a self-service password reset (SPE-68).
 *
 * No old password is required, so the caller must have proved control of the
 * mailbox. **An authenticated session is not that proof** — every signed-in user
 * has one. The actual gate is the recovery marker cookie, which only
 * `/auth/reset-callback` sets and only after Supabase verified the emailed link.
 * Without it we refuse, so this endpoint can't be repurposed by an ordinary
 * session into "change my password and clear my admin-reset flags."
 *
 * Distinct from `/api/auth/change-password`, which serves the *admin-reset*
 * path and deliberately requires `must_change_password` to be set. This route
 * must work for any user who followed a valid reset link, whether or not an
 * admin had also queued a reset for them.
 */
export const POST = withRoute(
  {
    body: bodySchema,
    // Modest cap: a reset is a once-in-a-while action, and the limiter is
    // per-user so a legitimate retry after a validation error is never blocked.
    // Fails open — a DB hiccup must not lock someone out of their own account.
    rateLimit: { requests: 10, windowSeconds: 3600, name: 'auth/reset-password' },
  },
  async ({ req, userId, body }) => {
    try {
      // Recovery marker gate — see the note above. Checked before anything else
      // so a session that never redeemed a reset link touches no auth state.
      if (!req.cookies.get(PASSWORD_RECOVERY_COOKIE)) {
        log.warn('Password reset attempted without a recovery marker', { userId });
        return NextResponse.json(
          { error: 'Start a password reset from the sign-in page to continue.' },
          { status: 403 }
        );
      }

      const supabase = await createClient();
      const { password } = body;

      const validation = validatePassword(password);
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.errors.join('. ') }, { status: 400 });
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        log.warn('Failed to update password during self-service reset', {
          userId,
          error: updateError.message,
        });
        // Surface Supabase's own message for the cases the user can act on —
        // notably leaked-password rejection (SPE-11) and "same as the old one".
        return NextResponse.json(
          { error: updateError.message || 'Failed to update password' },
          { status: 400 }
        );
      }

      // Clear BOTH password flags with a service-role client.
      //
      // Service client, not the request-scoped one: updateUser() above rotates
      // the session tokens, and reusing the user client here stalls on a token
      // refresh against the now-stale session and hangs the request forever
      // (SPE-280). The service client carries no session, so it completes.
      //
      // - must_change_password: an admin may have queued a reset for this same
      //   user. Leaving it set would bounce them to /change-password right after
      //   they just chose a password.
      // - password_reset_requested_at: drives the red "needs a reset" dot in the
      //   admin provider list. Stale-true means admins chase a resolved request.
      //
      // Wrapped so a service-client failure cannot 500 the request after the
      // password was already changed — same "log but don't fail" intent as
      // /api/auth/change-password.
      try {
        const serviceClient = createServiceClient();
        const { error: clearFlagsError } = await serviceClient
          .from('profiles')
          .update({ must_change_password: false, password_reset_requested_at: null })
          .eq('id', userId);

        if (clearFlagsError) {
          log.warn('Failed to clear password flags after self-service reset', {
            userId,
            error: clearFlagsError.message,
          });
        }
      } catch (clientError) {
        log.warn('Failed to create service client to clear password flags', {
          userId,
          error: clientError instanceof Error ? clientError.message : String(clientError),
        });
      }

      log.info('User completed self-service password reset', { userId });

      // Burn the marker: the link has been redeemed, so this browser shouldn't
      // be able to set another password without going through email again.
      const response = NextResponse.json({ success: true });
      response.cookies.delete(PASSWORD_RECOVERY_COOKIE);
      return response;
    } catch (error) {
      log.error('Unexpected error in reset-password:', error);
      return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
  }
);
