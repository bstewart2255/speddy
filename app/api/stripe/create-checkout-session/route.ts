import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripe, calculateTrialEndDate } from '@/src/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user already has a subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existingSubscription) {
      return NextResponse.json(
        { error: 'User already has a subscription' },
        { status: 400 }
      );
    }

    const { promo_code } = await request.json();

    // Check if the promo code is valid
    let referrerId = null;
    if (promo_code) {
      const { data: referralCode } = await supabase
        .from('referral_codes')
        .select('user_id')
        .eq('code', promo_code)
        .single();

      if (referralCode) {
        referrerId = referralCode.user_id;
      }
    }

    // Calculate trial end date
    const trialEnd = calculateTrialEndDate();

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email!,
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscribe`,
      subscription_data: {
        trial_end: trialEnd,
        metadata: {
          user_id: user.id,
          referrer_id: referrerId || '',
        },
      },
      metadata: {
        user_id: user.id,
        referrer_id: referrerId || '',
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}