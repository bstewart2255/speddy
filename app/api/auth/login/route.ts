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
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  const isFormSubmission = contentType.includes('application/x-www-form-urlencoded');

  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      email = body.email;
      password = body.password;
    } else if (isFormSubmission) {
      // Handle native form submission (progressive enhancement fallback)
      const formData = await request.formData();
      email = formData.get('email') as string;
      password = formData.get('password') as string;
    } else {
      // Unsupported content type
      log.warn('Unsupported content type in login', { contentType });
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 415 }
      );
    }
  } catch (error) {
    log.warn('Invalid request body in login', { error: (error as Error).message });
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Input validation
  if (!email || !password) {
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

  // Check profile with performance tracking
  const profilePerf = measurePerformance('login_profile_check');

  try {
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

    profilePerf.end({ role: profile?.role });

    // Track successful login
    track.event('login_success', {
      email,
      userId,
      role: profile?.role
    });

    // End overall performance tracking
    perf.end({
      email,
      userId,
      role: profile?.role
    });

    // Log final login result
    log.info('Login completed', {
      email,
      userId,
      role: profile?.role
    });

    // For native form submissions (progressive enhancement fallback), redirect instead of JSON
    if (isFormSubmission) {
      return NextResponse.redirect(new URL('/dashboard', request.url), 303);
    }

    return NextResponse.json({
      success: true
    });

  } catch (profileCheckError) {
    log.error('Error during login profile check', profileCheckError, {
      userId,
      email
    });

    // Still allow login but flag the error
    track.event('login_profile_check_error', {
      email,
      userId
    });

    // For native form submissions, redirect to dashboard
    if (isFormSubmission) {
      return NextResponse.redirect(new URL('/dashboard', request.url), 303);
    }

    // Return success but indicate potential issues
    return NextResponse.json({
      success: true,
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