import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Sign in the user
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    if (!data.session) {
      return NextResponse.json(
        { error: 'Login failed - no session created' },
        { status: 401 }
      );
    }

    // Check if user needs to complete payment
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.session.user.id)
      .single();

    // If not SEA user, check for subscription
    let needsPayment = false;
    if (profile?.role !== 'sea') {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', data.session.user.id)
        .maybeSingle();

      // If no subscription or not active/trialing, needs payment
      if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
        needsPayment = true;
      }
    }

    return NextResponse.json({
      success: true,
      needsPayment,
    });
  } catch (error) {
    console.error('Login route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}