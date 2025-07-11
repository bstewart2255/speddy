'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { formatPrice, SUBSCRIPTION_CONFIG, isCurrentMonthPauseable } from '@/src/lib/stripe';
import { format, differenceInDays } from 'date-fns';
import type { Subscription, ReferralCode, ReferralCredit } from '@/src/types/database';

interface SubscriptionData extends Subscription {
  referral_code?: ReferralCode;
  current_credits?: ReferralCredit;
}

export function SubscriptionManager() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);
      }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select(`
          *,
          referral_code:referral_codes(*),
          current_credits:referral_credits(*)
        `)
        .eq('user_id', user.id)
        .single();

      setSubscription(sub);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      alert('Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const pauseSubscription = async () => {
    if (!confirm('Pause your subscription for the summer months? You can resume anytime.')) {
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

  const renderTrialCountdown = () => {
    if (!subscription || !subscription.trial_end) return null;

    const trialEndDate = new Date(subscription.trial_end);
    const now = new Date();

    if (now >= trialEndDate) return null;

    const daysRemaining = differenceInDays(trialEndDate, now);
    const hoursRemaining = Math.floor((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60)) % 24;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium text-blue-900 mb-2">Free Trial Period</h3>
        <div className="text-3xl font-bold text-blue-900 mb-2">
          {daysRemaining} days, {hoursRemaining} hours remaining
        </div>
        <p className="text-sm text-blue-700">
          Your trial ends on {format(trialEndDate, 'MMMM d, yyyy')}. 
          You'll be charged {formatPrice(SUBSCRIPTION_CONFIG.monthlyPrice)} on this date.
        </p>
      </div>
    );
  };

  if (loading) {
    return <div className="animate-pulse">Loading subscription...</div>;
  }

  // Special message for SEA users
  if (userRole === 'sea') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-green-900 mb-2">
          Free Access for Special Education Assistants
        </h3>
        <p className="text-green-700">
          As a Special Education Assistant, you have free access to all Speddy features! 
          Thank you for your important work supporting students with special needs.
        </p>
        <div className="mt-4 p-4 bg-white rounded-md">
          <h4 className="font-medium text-gray-900 mb-2">Your Benefits Include:</h4>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Full access to all features</li>
            <li>• Unlimited student profiles</li>
            <li>• AI-powered lesson planning</li>
            <li>• Progress tracking & reports</li>
            <li>• Team collaboration features</li>
            <li>• No payment required</li>
          </ul>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No active subscription found.</p>
      </div>
    );
  }

  const effectivePrice = subscription.current_credits
    ? Math.max(0, SUBSCRIPTION_CONFIG.monthlyPrice - subscription.current_credits.total_credits)
    : SUBSCRIPTION_CONFIG.monthlyPrice;

  return (
    <div className="space-y-6">
      {/* Trial Countdown */}
      {renderTrialCountdown()}

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
          <div>
            <dt className="text-sm font-medium text-gray-500">Current Period</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {format(new Date(subscription.current_period_start), 'MMM d')} - {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
            </dd>
          </div>
          {subscription.status === 'trialing' && subscription.trial_end && (
            <div>
              <dt className="text-sm font-medium text-gray-500">First Payment Date</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {format(new Date(subscription.trial_end), 'MMMM d, yyyy')}
              </dd>
            </div>
          )}
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