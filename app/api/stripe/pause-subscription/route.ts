import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripe, isCurrentMonthPauseable } from '@/src/lib/stripe';

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

    // Check if pausing is allowed
    if (!isCurrentMonthPauseable()) {
      return NextResponse.json(
        { error: 'Subscriptions can only be paused for future months' },
        { status: 400 }
      );
    }

    // Get the user's subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!subscription) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    if (subscription.status !== 'active') {
      return NextResponse.json(
        { error: 'Only active subscriptions can be paused' },
        { status: 400 }
      );
    }

    // Calculate next month's dates
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const pauseEnd = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0); // Last day of next month

    // Create pause record
    await supabase
      .from('subscription_pauses')
      .insert({
        subscription_id: subscription.id,
        pause_start: nextMonth.toISOString(),
        pause_end: pauseEnd.toISOString(),
      });

    // Update subscription status (will be synced with Stripe webhook)
    await supabase
      .from('subscriptions')
      .update({ status: 'paused' })
      .eq('id', subscription.id);

    // Pause the subscription in Stripe
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      pause_collection: {
        behavior: 'void',
        resumes_at: Math.floor(pauseEnd.getTime() / 1000),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error pausing subscription:', error);
    return NextResponse.json(
      { error: 'Failed to pause subscription' },
      { status: 500 }
    );
  }
}