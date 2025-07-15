import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/src/lib/stripe';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withAuth } from '@/lib/api/with-auth';

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('create_customer_portal_session', 'api');
  
  try {
    const supabase = await createClient();
    
    log.info('Creating customer portal session', { userId });

    // Get the user's subscription
    const subPerf = measurePerformanceWithAlerts('fetch_subscription', 'database');
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();
    subPerf.end({ found: !!subscription });

    if (subError || !subscription) {
      log.warn('No subscription found for customer portal', {
        userId,
        error: subError?.message
      });
      
      track.event('customer_portal_no_subscription', {
        userId
      });
      
      perf.end({ success: false, reason: 'no_subscription' });
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    // Create a portal session
    const portalPerf = measurePerformanceWithAlerts('stripe_create_portal_session', 'api');
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });
    portalPerf.end({ sessionId: session.id });
    
    log.info('Customer portal session created', {
      userId,
      sessionId: session.id,
      customerId: subscription.stripe_customer_id
    });
    
    track.event('customer_portal_session_created', {
      userId,
      sessionId: session.id,
      customerId: subscription.stripe_customer_id
    });

    perf.end({ success: true });
    
    return NextResponse.json({ url: session.url });
  } catch (error) {
    log.error('Error creating portal session', error, { userId });
    
    track.event('customer_portal_error', {
      userId,
      error: (error as Error).message
    });
    
    perf.end({ success: false });
    
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
});