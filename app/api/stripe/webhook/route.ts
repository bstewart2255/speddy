import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/src/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = headers();
  const signature = headersList.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const referrerId = session.metadata?.referrer_id;
  
  if (!userId || !session.subscription || !session.customer) return;

  // Get the subscription details
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

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
    console.error('Error creating subscription record:', subError);
    throw subError;
  }

  // Create referral relationship if applicable
  if (referrerId) {
    const { error: refError } = await supabaseAdmin
      .from('referral_relationships')
      .insert({
        referrer_id: referrerId,
        referred_id: userId,
        subscription_id: subscription.id,
        status: 'trial',
      });

    if (refError) {
      console.error('Error creating referral relationship:', refError);
    }

    // Increment referral code usage
    await supabaseAdmin.rpc('increment', {
      table_name: 'referral_codes',
      column_name: 'uses_count',
      row_id: referrerId,
    });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
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
    console.error('Error updating subscription:', error);
    throw error;
  }

  // Update referral relationship status if transitioning from trial
  if (subscription.status === 'active' && !subscription.trial_end) {
    await supabaseAdmin
      .from('referral_relationships')
      .update({ status: 'active' })
      .eq('subscription_id', subscription.id)
      .eq('status', 'trial');
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Update subscription status
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }

  // Update referral relationship
  await supabaseAdmin
    .from('referral_relationships')
    .update({ status: 'canceled' })
    .eq('subscription_id', subscription.id);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // Only process for subscription invoices (not one-time payments)
  if (!invoice.subscription) return;

  // Get the subscription
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', invoice.subscription as string)
    .single();

  if (!subscription) return;

  // Calculate and apply referral credits for this month
  const invoiceMonth = new Date(invoice.period_start * 1000);
  await calculateMonthlyReferralCredits(subscription.user_id, invoiceMonth);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  // Update subscription status to past_due
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', invoice.subscription as string);
}

async function calculateMonthlyReferralCredits(userId: string, month: Date) {
  // Get all active referrals for this user
  const { data: activeReferrals } = await supabaseAdmin
    .from('referral_relationships')
    .select('*')
    .eq('referrer_id', userId)
    .eq('status', 'active');

  if (!activeReferrals || activeReferrals.length === 0) return;

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
}