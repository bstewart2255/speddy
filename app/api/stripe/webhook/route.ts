import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/src/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = headers().get('stripe-signature')!;

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
        const userId = session.metadata?.user_id;
        const referrerId = session.metadata?.referrer_id;
        
        if (!userId) {
          console.error('No user_id in session metadata');
          break;
        }

        // Get the subscription details
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        // Create subscription record
        const { data: subData, error: subError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
          })
          .select()
          .single();

        if (subError) {
          console.error('Error creating subscription:', subError);
          break;
        }

        // Create referral code for new user
        const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        await supabase
          .from('referral_codes')
          .insert({
            user_id: userId,
            code: referralCode,
          });

        // If there's a referrer, create the relationship
        if (referrerId && subData) {
          await supabase
            .from('referral_relationships')
            .insert({
              referrer_id: referrerId,
              referred_id: userId,
              subscription_id: subData.id,
              status: subscription.status === 'trialing' ? 'trial' : 'active',
            });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        
        if (!userId) {
          console.error('No user_id in subscription metadata');
          break;
        }

        // Update subscription record
        await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
          })
          .eq('stripe_subscription_id', subscription.id);

        // Update referral relationships if status changed
        if (subscription.status === 'active' || subscription.status === 'canceled') {
          await supabase
            .from('referral_relationships')
            .update({ status: subscription.status })
            .eq('referred_id', userId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Update subscription record
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        // Update referral relationships
        const userId = subscription.metadata?.user_id;
        if (userId) {
          await supabase
            .from('referral_relationships')
            .update({ status: 'canceled' })
            .eq('referred_id', userId);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string
        );
        const userId = subscription.metadata?.user_id;
        
        if (!userId) break;

        // Calculate and apply referral credits for the upcoming month
        const { count: activeReferrals } = await supabase
          .from('referral_relationships')
          .select('*', { count: 'exact' })
          .eq('referrer_id', userId)
          .in('status', ['active', 'trial']);

        if (activeReferrals && activeReferrals > 0) {
          const creditAmount = Math.min(activeReferrals * 5, 15); // Max $15 credit
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          const monthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

          await supabase
            .from('referral_credits')
            .upsert({
              user_id: userId,
              month: monthKey,
              total_credits: creditAmount,
              credits_applied: creditAmount,
              status: 'pending',
            });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}