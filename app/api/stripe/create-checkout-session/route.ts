import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripe } from '@/src/lib/stripe';
import { calculateTrialEndDate } from '@/src/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const { referralCode } = await request.json();

    // Validate referral code if provided
    let referrerId: string | null = null;
    if (referralCode) {
      const { data: referralData, error: referralError } = await supabase
        .from('referral_codes')
        .select('user_id')
        .eq('code', referralCode.toUpperCase())
        .single();

      if (!referralError && referralData) {
        referrerId = referralData.user_id;
      }
    }

    // Calculate trial end date
    const hasValidReferral = !!referrerId;
    const trialEnd = calculateTrialEndDate(hasValidReferral);

    // Get user profile for metadata
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Create or retrieve Stripe customer
    let customerId: string;
    
    // Check if user already has a subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: {
          supabase_user_id: user.id,
          full_name: profile?.full_name || '',
          school_district: profile?.school_district || '',
          school_site: profile?.school_site || '',
          referrer_id: referrerId || '',
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_MONTHLY_PRICE_ID!,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_end: Math.floor(trialEnd.getTime() / 1000), // Convert to Unix timestamp
        metadata: {
          referrer_id: referrerId || '',
          trial_days: hasValidReferral ? '60' : '30',
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?payment_success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/signup?payment_cancelled=true`,
      metadata: {
        user_id: user.id,
        referrer_id: referrerId || '',
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}