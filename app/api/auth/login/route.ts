import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { withErrorHandling } from '@/lib/api/with-error-handling';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformance } from '@/lib/monitoring/performance';

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Start performance monitoring
  const perf = measurePerformance('login_attempt');

  let email, password;
  try {
    const body = await request.json();
    email = body.email;
    password = body.password;
  } catch (error) {
    log.warn('Invalid JSON in login request', { error: (error as Error).message });
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Input validation with logging
  if (!email || !password) {
    log.warn('Login attempt with missing credentials', {
      hasEmail: !!email,
      hasPassword: !!password
    });

    return NextResponse.json(
      { error: 'Email and password are required' },
      { status: 400 }
    );
  }

  // Log login attempt (without password!)
  log.info('Login attempt started', { email });

  // Create a response that we'll return at the end
  const cookieStore = await cookies();

  // Create supabase client with cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({
              name,
              value,
              ...options,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            });
          });
        },
      },
    }
  );

  // Sign in the user with performance tracking
  const authPerf = measurePerformance('supabase_auth_signin');
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  authPerf.end({ email });

  if (error) {
    // Log failed login attempts for security monitoring
    log.warn('Login failed', { 
      email,
      error: error.message,
      errorCode: error.code 
    });

    // Track failed login for analytics
    track.event('login_failed', {
      email,
      errorCode: error.code,
      errorMessage: error.message
    });

    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    );
  }

  if (!data.session) {
    log.error('Login succeeded but no session created', null, { email });

    return NextResponse.json(
      { error: 'Login failed - no session created' },
      { status: 401 }
    );
  }

  // Log successful authentication
  const userId = data.session.user.id;
  log.info('User authenticated successfully', { email, userId });

  // Check profile and subscription with performance tracking
  const profilePerf = measurePerformance('login_profile_check');

  try {
    // Check if user needs to complete payment
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError) {
      log.error('Failed to fetch user profile during login', profileError, { 
        userId,
        email 
      });
    }

    // If not SEA or teacher user, check for subscription
    let needsPayment = false;
    if (profile?.role !== 'sea' && profile?.role !== 'teacher') {
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      if (subError) {
        log.error('Failed to check subscription status', subError, { 
          userId,
          email 
        });
      }

      // If no subscription or not active/trialing, needs payment
      if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
        needsPayment = true;
        log.info('User needs payment', { 
          userId,
          email,
          subscriptionStatus: subscription?.status || 'none' 
        });
      }
    }

    profilePerf.end({ 
      role: profile?.role,
      needsPayment 
    });

    // Track successful login
    track.event('login_success', {
      email,
      userId,
      role: profile?.role,
      needsPayment
    });

    // End overall performance tracking
    perf.end({
      email,
      userId,
      needsPayment,
      role: profile?.role
    });

    // Log final login result
    log.info('Login completed', {
      email,
      userId,
      needsPayment,
      role: profile?.role
    });

    return NextResponse.json({
      success: true,
      needsPayment,
    });

  } catch (profileCheckError) {
    // This error is already logged by withErrorHandling,
    // but we can add context
    log.error('Error during login profile/subscription check', profileCheckError, {
      userId,
      email
    });

    // Still allow login but flag the error
    track.event('login_profile_check_error', {
      email,
      userId
    });

    // Return success but indicate potential issues
    return NextResponse.json({
      success: true,
      needsPayment: false, // Default to no payment needed if check fails
      warning: 'Profile check failed'
    });
  }
});

// Alternative: If you prefer to keep the original structure 
// but add monitoring manually (without withErrorHandling wrapper):
/*
export async function POST(request: NextRequest) {
  const perf = measurePerformance('login_attempt');

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      log.warn('Login attempt with missing credentials');
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    log.info('Login attempt', { email });

    // ... rest of your code with logging added

  } catch (error) {
    log.error('Login route error', error);
    perf.end({ error: true });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
*/