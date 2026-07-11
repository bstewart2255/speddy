/**
 * Google OAuth callback (SPE-205): verifies CSRF state, exchanges the code,
 * stores encrypted tokens, and returns the user to their meetings page with
 * a ?calendar= status flag (connected | denied | error | not_configured).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  emailFromIdToken,
  exchangeCodeForTokens,
  getGoogleOAuthClient,
} from '@/lib/calendar/google-oauth';
import { saveGoogleConnection } from '@/lib/calendar/connections';
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';
import {
  STATE_COOKIE,
  canonicalOrigin,
  meetingsPathForUser,
} from '@/lib/calendar/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const origin = canonicalOrigin(request);
  if (!user) {
    // Session lost mid-flow (e.g. cookie cleared); nothing was stored.
    return NextResponse.redirect(new URL('/login', origin));
  }

  const meetingsPath = await meetingsPathForUser(supabase, user.id);
  const redirectWithFlag = (flag: string) => {
    const response = NextResponse.redirect(
      new URL(`${meetingsPath}?calendar=${flag}`, origin)
    );
    response.cookies.set(STATE_COOKIE, '', {
      path: '/api/calendar/google',
      maxAge: 0,
    });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const errorParam = params.get('error');
  if (errorParam) {
    return redirectWithFlag(errorParam === 'access_denied' ? 'denied' : 'error');
  }

  const code = params.get('code');
  const state = params.get('state');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithFlag('error');
  }

  const client = getGoogleOAuthClient();
  if (!client) {
    return redirectWithFlag('not_configured');
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri: `${origin}/api/calendar/google/callback`,
      client,
    });
    await saveGoogleConnection(
      supabase,
      user.id,
      tokens,
      emailFromIdToken(tokens.id_token)
    );
    await logServerAuditEvent({
      user_id: user.id,
      action: 'calendar.connected',
      resource_type: 'calendar_connection',
      metadata: { provider: 'google' },
    });
    return redirectWithFlag('connected');
  } catch (err) {
    // GoogleOAuthError messages carry Google's error_description only —
    // never token material.
    console.error(
      'Google Calendar connect failed:',
      err instanceof Error ? err.message : 'unknown error'
    );
    return redirectWithFlag('error');
  }
}
