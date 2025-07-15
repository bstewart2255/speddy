import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/src/lib/stripe';
import { calculateTrialEndDate } from '@/src/lib/stripe';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('create_checkout_session', 'api');
  
  try {
    const supabase = await createClient();

    // Get request body
    const { referralCode } = await request.json();
    
    log.info('Creating checkout session', {
      userId,
      hasReferralCode: !!referralCode
    });

    // Validate referral code if provided
    let referrerId: string | null = null;
    if (referralCode) {
      const refPerf = measurePerformanceWithAlerts('validate_referral_code', 'database');
      const { data: referralData, error: referralError } = await supabase
        .from('referral_codes')
        .select('user_id')
        .eq('code', referralCode.toUpperCase())
        .single();
      refPerf.end({ found: !!referralData });

      if (!referralError && referralData) {
        referrerId = referralData.user_id;
        log.info('Valid referral code used', { 
          userId,
          referrerId,
          referralCode: referralCode.substring(0, 4) + '****' 
        });
      } else if (referralError) {
        log.warn('Invalid referral code attempt', {
          userId,
          referralCode: referralCode.substring(0, 4) + '****',
          error: referralError.message
        });
      }
    }

    // Calculate trial end date
    const hasValidReferral = !!referrerId;
    const trialEnd = calculateTrialEndDate(hasValidReferral);

    // Get user profile for metadata
    const profilePerf = measurePerformanceWithAlerts('fetch_user_profile', 'database');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    profilePerf.end({ hasProfile: !!profile });
    
    if (profileError) {
      log.error('Failed to fetch user profile', profileError, { userId });
    }
    
    // Get user email from auth
    const { data: { user } } = await supabase.auth.getUser();
    const userEmail = user?.email || '';

    // Create or retrieve Stripe customer
    let customerId: string;
    
    // Check if user already has a subscription
    const subCheckPerf = measurePerformanceWithAlerts('check_existing_subscription', 'database');
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();
    subCheckPerf.end({ hasExisting: !!existingSubscription });

    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const stripePerf = measurePerformanceWithAlerts('stripe_create_customer', 'api');
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          supabase_user_id: userId,
          full_name: profile?.full_name || '',
          school_district: profile?.school_district || '',
          school_site: profile?.school_site || '',
          referrer_id: referrerId || '',
        },
      });
      customerId = customer.id;
      stripePerf.end({ customerId });
      
      log.info('Created new Stripe customer', {
        userId,
        customerId,
        hasReferrer: !!referrerId
      });
    }

    // Create checkout session
    const sessionPerf = measurePerformanceWithAlerts('stripe_create_checkout_session', 'api');
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
        user_id: userId,
        referrer_id: referrerId || '',
      },
    });
    sessionPerf.end({ sessionId: session.id });
    
    log.info('Checkout session created', {
      userId,
      sessionId: session.id,
      customerId,
      trialDays: hasValidReferral ? 60 : 30,
      hasReferrer: !!referrerId
    });
    
    track.event('checkout_session_created', {
      userId,
      sessionId: session.id,
      customerId,
      trialDays: hasValidReferral ? 60 : 30,
      hasReferralCode: !!referralCode,
      hasValidReferral
    });

    perf.end({ success: true, sessionId: session.id });
    
    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    log.error('Error creating checkout session', error, { userId });
    
    track.event('checkout_session_error', {
      userId,
      error: (error as Error).message
    });
    
    perf.end({ success: false });
    
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
});