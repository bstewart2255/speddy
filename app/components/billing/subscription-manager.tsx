'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { formatPrice, SUBSCRIPTION_CONFIG, isCurrentMonthPauseable } from '../../../src/lib/stripe';
import { format } from 'date-fns';
import type { Subscription, ReferralCode, ReferralCredit } from '../../../src/types/database';

interface SubscriptionData extends Subscription {
  referral_code?: ReferralCode;
  current_credits?: ReferralCredit;
}

export function SubscriptionManager() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (sub) {
        // Get referral code
        const { data: code } = await supabase
          .from('referral_codes')
          .select('*')
          .eq('user_id', user.id)
          .single();

        // Get current month's credits
        const currentMonth = format(new Date(), 'yyyy-MM-01');
        const { data: credits } = await supabase
          .from('referral_credits')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', currentMonth)
          .single();

        setSubscription({
          ...sub,
          referral_code: code || undefined,
          current_credits: credits || undefined,
        });
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error opening portal:', error);
    } finally {
      setPortalLoading(false);
    }
  };

  const pauseSubscription = async () => {
    if (!isCurrentMonthPauseable()) {
      alert('Subscriptions can only be paused during June or July.');
      return;
    }

    const pauseUntil = prompt('Pause until (MM/DD/YYYY):');
    if (!pauseUntil) return;

    setPauseLoading(true);
    try {
      const response = await fetch('/api/stripe/pause-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pauseUntil }),
      });

      if (response.ok) {
        await loadSubscriptionData();
        alert('Subscription paused successfully!');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to pause subscription');
      }
    } catch (error) {
      console.error('Error pausing subscription:', error);
      alert('Failed to pause subscription');
    } finally {
      setPauseLoading(false);
    }
  };

  const resumeSubscription = async () => {
    setPauseLoading(true);
    try {
      const response = await fetch('/api/stripe/pause-subscription', {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadSubscriptionData();
        alert('Subscription resumed successfully!');
      }
    } catch (error) {
      console.error('Error resuming subscription:', error);
      alert('Failed to resume subscription');
    } finally {
      setPauseLoading(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse">Loading subscription...</div>;
  }

  if (!subscription) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No active subscription found.</p>
        <a
          href="/subscribe"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          Subscribe Now
        </a>
      </div>
    );
  }

  const effectivePrice = subscription.current_credits
    ? Math.max(0, SUBSCRIPTION_CONFIG.monthlyPrice - subscription.current_credits.total_credits)
    : SUBSCRIPTION_CONFIG.monthlyPrice;

  return (
    <div className="space-y-6">
      {/* Subscription Status */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Subscription Status</h3>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1 text-sm text-gray-900 capitalize">{subscription.status}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Monthly Price</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {formatPrice(effectivePrice)}
              {subscription.current_credits && subscription.current_credits.total_credits > 0 && (
                <span className="text-green-600 ml-1">
                  (${subscription.current_credits.total_credits} credit applied)
                </span>
              )}
            </dd>
          </div>
          {subscription.trial_end && new Date(subscription.trial_end) > new Date() && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Trial Ends</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {format(new Date(subscription.trial_end), 'MMM d, yyyy')}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Current Period</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {format(new Date(subscription.current_period_start), 'MMM d')} - {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
            </dd>
          </div>
        </dl>
      </div>

      {/* Referral Code */}
      {subscription.referral_code && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Your Referral Code</h3>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-3xl font-mono font-bold text-blue-900 text-center mb-2">
              {subscription.referral_code.code}
            </p>
            <p className="text-sm text-blue-700 text-center">
              Share this code to give colleagues 60 days free and earn $1/month off your subscription!
            </p>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p>Total referrals: {subscription.referral_code.uses_count}</p>
            {subscription.current_credits && (
              <p>Active referral credits: ${subscription.current_credits.total_credits}/month</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Manage Subscription</h3>
        <div className="space-y-3">
          <button
            onClick={openCustomerPortal}
            disabled={portalLoading}
            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {portalLoading ? 'Opening...' : 'Manage Payment Method'}
          </button>
          
          {subscription.status === 'active' && isCurrentMonthPauseable() && (
            <button
              onClick={pauseSubscription}
              disabled={pauseLoading}
              className="w-full flex justify-center py-2 px-4 border border-yellow-300 rounded-md shadow-sm text-sm font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
            >
              {pauseLoading ? 'Processing...' : 'Pause for Summer'}
            </button>
          )}
          
          {subscription.status === 'paused' && (
            <button
              onClick={resumeSubscription}
              disabled={pauseLoading}
              className="w-full flex justify-center py-2 px-4 border border-green-300 rounded-md shadow-sm text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              {pauseLoading ? 'Processing...' : 'Resume Subscription'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}