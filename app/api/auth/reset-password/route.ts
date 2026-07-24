import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { validatePassword } from '@/lib/utils/password-validation';
import { log } from '@/lib/monitoring/logger';
import { withRoute } from '@/lib/api/with-route';

const bodySchema = z.object({ password: z.string().min(1) }).passthrough();

/**
 * Completes a self-service password reset (SPE-68).
 *
 * The caller is authenticated by the recovery session established in
 * `/auth/reset-callback` — holding that session IS the proof they control the
 * mailbox, so no old password is required here.
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
  async ({ userId, body }) => {
    try {
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

      return NextResponse.json({ success: true });
    } catch (error) {
      log.error('Unexpected error in reset-password:', error);
      return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
  }
);
