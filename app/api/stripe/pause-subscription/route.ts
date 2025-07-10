import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripe } from '@/src/lib/stripe';
import { isCurrentMonthPauseable } from '@/src/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if current month is pauseable
    if (!isCurrentMonthPauseable()) {
      return NextResponse.json(
        { error: 'Subscriptions can only be paused in June or July' },
        { status: 400 }
      );
    }

    const { pauseUntil } = await request.json();
    const pauseEndDate = new Date(pauseUntil);

    // Validate pause end date is in June or July
    const pauseEndMonth = pauseEndDate.getMonth() + 1;
    if (![6, 7].includes(pauseEndMonth)) {
      return NextResponse.json(
        { error: 'Pause must end in June or July' },
        { status: 400 }
      );
    }

    // Get subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    // Pause the subscription in Stripe
    const stripeSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        pause_collection: {
          behavior: 'void',
          resumes_at: Math.floor(pauseEndDate.getTime() / 1000),
        },
      }
    );

    // Record the pause in our database
    const { error: pauseError } = await supabase
      .from('subscription_pauses')
      .insert({
        subscription_id: subscription.id,
        pause_start: new Date().toISOString().split('T')[0],
        pause_end: pauseEndDate.toISOString().split('T')[0],
      });

    if (pauseError) {
      console.error('Error recording pause:', pauseError);
    }

    // Update subscription status
    await supabase
      .from('subscriptions')
      .update({ status: 'paused' })
      .eq('id', subscription.id);

    // Update referral relationships to paused
    await supabase
      .from('referral_relationships')
      .update({ status: 'paused' })
      .eq('subscription_id', subscription.stripe_subscription_id)
      .eq('status', 'active');

    return NextResponse.json({ 
      success: true,
      pauseUntil: pauseEndDate.toISOString(),
    });
  } catch (error) {
    console.error('Error pausing subscription:', error);
    return NextResponse.json(
      { error: 'Failed to pause subscription' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get subscription
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

    // Resume the subscription in Stripe
    await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        pause_collection: null,
      }
    );

    // Update subscription status
    await supabase
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('id', subscription.id);

    // Reactivate referral relationships
    await supabase
      .from('referral_relationships')
      .update({ status: 'active' })
      .eq('subscription_id', subscription.stripe_subscription_id)
      .eq('status', 'paused');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resuming subscription:', error);
    return NextResponse.json(
      { error: 'Failed to resume subscription' },
      { status: 500 }
    );
  }
}