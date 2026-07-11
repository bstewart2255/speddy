/**
 * Starts the Google Calendar OAuth flow (SPE-205): sets a CSRF state cookie
 * and redirects the signed-in user to Google's consent screen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import {
  buildGoogleAuthUrl,
  getGoogleOAuthClient,
} from '@/lib/calendar/google-oauth';
import { tokenEncryptionConfigured } from '@/lib/calendar/token-crypto';
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
    return NextResponse.redirect(new URL('/login', origin));
  }

  const meetingsPath = await meetingsPathForUser(supabase, user.id);
  const client = getGoogleOAuthClient();
  if (!client || !tokenEncryptionConfigured()) {
    return NextResponse.redirect(
      new URL(`${meetingsPath}?calendar=not_configured`, origin)
    );
  }

  const state = randomBytes(16).toString('hex');
  const response = NextResponse.redirect(
    buildGoogleAuthUrl({
      clientId: client.clientId,
      redirectUri: `${origin}/api/calendar/google/callback`,
      state,
    })
  );
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // sent on Google's top-level GET redirect back to us
    path: '/api/calendar/google',
    maxAge: 600,
  });
  return response;
}
