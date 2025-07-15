import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/src/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { withErrorHandling } from '@/lib/api/with-error-handling';

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Start overall performance tracking
  const perf = measurePerformanceWithAlerts('stripe_webhook', 'api');

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    log.error('Stripe webhook missing signature', null);
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    log.info('Stripe webhook received', { 
      eventType: event.type,
      eventId: event.id 
    });
  } catch (err) {
    log.error('Webhook signature verification failed', err, {
      signature: signature.substring(0, 20) + '...' // Log partial signature for debugging
    });

    track.event('stripe_webhook_invalid_signature', {
      error: (err as Error).message
    });

    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    // Track performance for each event type
    const eventPerf = measurePerformanceWithAlerts(`stripe_webhook_${event.type}`, 'api');

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        log.info('Processing checkout completion', {
          sessionId: session.id,
          customerId: session.customer,
          userId: session.metadata?.user_id
        });

        await handleCheckoutSessionCompleted(session);

        track.event('checkout_completed', {
          sessionId: session.id,
          amount: session.amount_total,
          currency: session.currency,
          userId: session.metadata?.user_id
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        log.info('Processing subscription update', {
          subscriptionId: subscription.id,
          status: subscription.status,
          previousStatus: subscription.metadata?.previous_status
        });

        await handleSubscriptionUpdated(subscription);

        track.event('subscription_updated', {
          subscriptionId: subscription.id,
          status: subscription.status,
          customerId: subscription.customer
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        log.info('Processing subscription deletion', {
          subscriptionId: subscription.id,
          customerId: subscription.customer
        });

        await handleSubscriptionDeleted(subscription);

        track.event('subscription_canceled', {
          subscriptionId: subscription.id,
          customerId: subscription.customer
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        log.info('Processing successful payment', {
          invoiceId: invoice.id,
          amount: invoice.amount_paid,
          customerId: invoice.customer
        });

        await handleInvoicePaymentSucceeded(invoice);

        track.event('payment_succeeded', {
          invoiceId: invoice.id,
          amount: invoice.amount_paid,
          currency: invoice.currency
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        log.warn('Payment failed', {
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          customerId: invoice.customer,
          attemptCount: invoice.attempt_count
        });

        await handleInvoicePaymentFailed(invoice);

        track.event('payment_failed', {
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          attemptCount: invoice.attempt_count
        });
        break;
      }

      default:
        log.info('Unhandled webhook event type', { eventType: event.type });
    }

    eventPerf.end({ success: true });
    perf.end({ eventType: event.type, success: true });

    return NextResponse.json({ received: true });
  } catch (error) {
    log.error('Webhook handler error', error, {
      eventType: event.type,
      eventId: event.id
    });

    track.event('stripe_webhook_error', {
      eventType: event.type,
      error: (error as Error).message
    });

    perf.end({ eventType: event.type, success: false });

    // Return 200 to prevent Stripe from retrying
    // Log the error but don't fail the webhook
    return NextResponse.json({ 
      received: true, 
      error: 'Handler error logged' 
    });
  }
});

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const perf = measurePerformanceWithAlerts('handle_checkout_completed', 'api');

  const userId = session.metadata?.user_id;
  const referrerId = session.metadata?.referrer_id;

  if (!userId || !session.subscription || !session.customer) {
    log.warn('Checkout session missing required data', {
      sessionId: session.id,
      hasUserId: !!userId,
      hasSubscription: !!session.subscription,
      hasCustomer: !!session.customer
    });
    return;
  }

  try {
    // Get the subscription details
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );

    log.info('Creating subscription record', {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status
    });

    // Create subscription record
    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: userId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        trial_end: subscription.trial_end 
          ? new Date(subscription.trial_end * 1000).toISOString() 
          : null,
      });

    if (subError) {
      log.error('Error creating subscription record', subError, {
        userId,
        subscriptionId: subscription.id
      });
      throw subError;
    }

    // Create referral relationship if applicable
    if (referrerId) {
      log.info('Processing referral', {
        referrerId,
        referredId: userId
      });

      const { error: refError } = await supabaseAdmin
        .from('referral_relationships')
        .insert({
          referrer_id: referrerId,
          referred_id: userId,
          subscription_id: subscription.id,
          status: 'trial',
        });

      if (refError) {
        log.error('Error creating referral relationship', refError, {
          referrerId,
          referredId: userId
        });
      } else {
        // Increment referral code usage
        await supabaseAdmin.rpc('increment', {
          table_name: 'referral_codes',
          column_name: 'uses_count',
          row_id: referrerId,
        });

        track.event('referral_created', {
          referrerId,
          referredId: userId
        });
      }
    }

    perf.end({ success: true, hasReferral: !!referrerId });
  } catch (error) {
    perf.end({ success: false });
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const perf = measurePerformanceWithAlerts('handle_subscription_updated', 'api');

  try {
    log.info('Updating subscription', {
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end 
          ? new Date(subscription.trial_end * 1000).toISOString() 
          : null,
      })
      .eq('stripe_subscription_id', subscription.id);

    if (error) {
      log.error('Error updating subscription', error, {
        subscriptionId: subscription.id
      });
      throw error;
    }

    // Update referral relationship status if transitioning from trial
    if (subscription.status === 'active' && !subscription.trial_end) {
      log.info('Activating referral relationship', {
        subscriptionId: subscription.id
      });

      await supabaseAdmin
        .from('referral_relationships')
        .update({ status: 'active' })
        .eq('subscription_id', subscription.id)
        .eq('status', 'trial');
    }

    perf.end({ success: true, status: subscription.status });
  } catch (error) {
    perf.end({ success: false });
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const perf = measurePerformanceWithAlerts('handle_subscription_deleted', 'api');

  try {
    log.info('Canceling subscription', {
      subscriptionId: subscription.id
    });

    // Update subscription status
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('stripe_subscription_id', subscription.id);

    if (error) {
      log.error('Error canceling subscription', error, {
        subscriptionId: subscription.id
      });
      throw error;
    }

    // Update referral relationship
    await supabaseAdmin
      .from('referral_relationships')
      .update({ status: 'canceled' })
      .eq('subscription_id', subscription.id);

    perf.end({ success: true });
  } catch (error) {
    perf.end({ success: false });
    throw error;
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const perf = measurePerformanceWithAlerts('handle_payment_succeeded', 'api');

  try {
    log.info('Processing successful payment', {
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription,
      amount: invoice.amount_paid
    });

    // Get the subscription
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', invoice.subscription as string)
      .single();

    if (!subscription) {
      log.warn('Subscription not found for invoice', {
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription
      });
      return;
    }

    // Calculate and apply referral credits for this month
    const invoiceMonth = new Date(invoice.period_start * 1000);
    await calculateMonthlyReferralCredits(subscription.user_id, invoiceMonth);

    perf.end({ success: true });
  } catch (error) {
    perf.end({ success: false });
    log.error('Error processing payment success', error, {
      invoiceId: invoice.id
    });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const perf = measurePerformanceWithAlerts('handle_payment_failed', 'api');

  try {
    log.warn('Processing failed payment', {
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription,
      amount: invoice.amount_due,
      attemptCount: invoice.attempt_count
    });

    // Update subscription status to past_due
    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', invoice.subscription as string);

    // Track critical payment failures
    if (invoice.attempt_count && invoice.attempt_count >= 3) {
      track.event('payment_failure_critical', {
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription,
        attemptCount: invoice.attempt_count
      });
    }

    perf.end({ success: true });
  } catch (error) {
    perf.end({ success: false });
    log.error('Error processing payment failure', error, {
      invoiceId: invoice.id
    });
  }
}

async function calculateMonthlyReferralCredits(userId: string, month: Date) {
  const perf = measurePerformanceWithAlerts('calculate_referral_credits', 'api');

  try {
    log.info('Calculating referral credits', {
      userId,
      month: month.toISOString()
    });

    // Get all active referrals for this user
    const { data: activeReferrals } = await supabaseAdmin
      .from('referral_relationships')
      .select('*')
      .eq('referrer_id', userId)
      .eq('status', 'active');

    if (!activeReferrals || activeReferrals.length === 0) {
      perf.end({ hasReferrals: false });
      return;
    }

    // Calculate total credits
    const totalCredits = activeReferrals.reduce(
      (sum, ref) => sum + ref.credit_amount,
      0
    );

    // Format month for storage (YYYY-MM-01)
    const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;

    // Upsert referral credits for this month
    await supabaseAdmin
      .from('referral_credits')
      .upsert({
        user_id: userId,
        month: monthStr,
        total_credits: totalCredits,
        credits_applied: Math.min(totalCredits, 11.99), // Cap at subscription price
        payout_amount: Math.max(0, totalCredits - 11.99), // Amount over subscription price
        status: 'applied',
      });

    log.info('Referral credits applied', {
      userId,
      totalCredits,
      referralCount: activeReferrals.length
    });

    track.event('referral_credits_applied', {
      userId,
      totalCredits,
      referralCount: activeReferrals.length
    });

    perf.end({ 
      success: true, 
      referralCount: activeReferrals.length,
      totalCredits 
    });
  } catch (error) {
    perf.end({ success: false });
    log.error('Error calculating referral credits', error, { userId });
  }
}