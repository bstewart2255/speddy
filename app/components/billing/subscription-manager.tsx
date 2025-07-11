'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { formatPrice, SUBSCRIPTION_CONFIG, isCurrentMonthPauseable } from '@/src/lib/stripe';
import { format } from 'date-fns';
import type { Subscription, ReferralCode, ReferralCredit } from '@/src/types/database';

interface SubscriptionData extends Subscription {
  referral_code?: ReferralCode;
  referral_credits?: ReferralCredit[];
}

export function SubscriptionManager() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [referralCount, setReferralCount] = useState(0);
  const [referralUrl, setReferralUrl] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch subscription with referral data
      const { data: sub } = await supabase
        .from('subscriptions')
        .select(`
          *,
          referral_code:referral_codes(*),
          referral_credits(*)
        `)
        .eq('user_id', user.id)
        .single();

      if (sub) {
        setSubscription(sub as SubscriptionData);
        
        // Fetch referral count
        const { count } = await supabase
          .from('referral_relationships')
          .select('*', { count: 'exact' })
          .eq('referrer_id', user.id)
          .in('status', ['active', 'trial']);
        
        setReferralCount(count || 0);
        
        // Set referral URL
        if (sub.referral_code?.code) {
          const baseUrl = window.location.origin;
          setReferralUrl(`${baseUrl}/signup?ref=${sub.referral_code.code}`);
        }
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access at the end of your current billing period.')) {
      return;
    }

    setCancelLoading(true);
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCancelLoading(false);
    }
  };

  const handlePauseSubscription = async () => {
    if (!isCurrentMonthPauseable()) {
      alert('Subscriptions can only be paused for future months. Pausing takes effect on the 15th of the month.');
      return;
    }

    if (!confirm('Are you sure you want to pause your subscription for next month? You can resume anytime before the pause takes effect.')) {
      return;
    }

    setPauseLoading(true);
    try {
      const response = await fetch('/api/stripe/pause-subscription', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchSubscription();
        alert('Your subscription will be paused starting next month.');
      } else {
        alert(data.error || 'Failed to pause subscription');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to pause subscription');
    } finally {
      setPauseLoading(false);
    }
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const getCurrentMonthCredits = () => {
    const currentMonth = format(new Date(), 'yyyy-MM');
    return subscription?.referral_credits?.find(credit => 
      credit.month === currentMonth
    );
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No active subscription found.</p>
        <a 
          href="/subscribe"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          Subscribe Now
        </a>
      </div>
    );
  }

  const currentCredits = getCurrentMonthCredits();
  const hasEarnedCredits = referralCount > 0;

  return (
    <div className="space-y-6">
      {/* Subscription Details */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Subscription Details</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Status</span>
            <span className="font-medium capitalize">
              {subscription.status === 'active' ? (
                <span className="text-green-600">Active</span>
              ) : subscription.status === 'paused' ? (
                <span className="text-yellow-600">Paused</span>
              ) : (
                <span className="text-gray-600">{subscription.status}</span>
              )}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Monthly Price</span>
            <span className="font-medium">
              {hasEarnedCredits && currentCredits && currentCredits.credits_applied > 0 ? (
                <>
                  <span className="line-through text-gray-400 mr-2">
                    {formatPrice(SUBSCRIPTION_CONFIG.monthlyPrice)}
                  </span>
                  <span className="text-green-600">
                    {formatPrice(SUBSCRIPTION_CONFIG.monthlyPrice - currentCredits.credits_applied)}
                  </span>
                </>
              ) : (
                formatPrice(SUBSCRIPTION_CONFIG.monthlyPrice)
              )}
            </span>
          </div>

          {subscription.current_period_end && (
            <div className="flex justify-between">
              <span className="text-gray-600">Next Billing Date</span>
              <span className="font-medium">
                {format(new Date(subscription.current_period_end), 'MMMM d, yyyy')}
              </span>
            </div>
          )}

          {subscription.cancel_at_period_end && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                Your subscription will be canceled at the end of the current billing period.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleManageSubscription}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Manage Payment Method
          </button>
          
          {subscription.status === 'active' && !subscription.cancel_at_period_end && (
            <>
              <button
                onClick={handlePauseSubscription}
                disabled={pauseLoading || !isCurrentMonthPauseable()}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pauseLoading ? 'Processing...' : 'Pause Next Month'}
              </button>
              
              <button
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
                className="px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {cancelLoading ? 'Processing...' : 'Cancel Subscription'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Referral Program */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Referral Program</h3>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Earn $5 off your monthly subscription for each active referral!
            </p>
            
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Your Referral Link:</span>
                <button
                  onClick={copyReferralLink}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  {showSuccessMessage ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
              <p className="text-sm text-gray-600 break-all">{referralUrl}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-md">
              <p className="text-2xl font-bold text-blue-900">{referralCount}</p>
              <p className="text-sm text-blue-700">Active Referrals</p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-md">
              <p className="text-2xl font-bold text-green-900">
                {formatPrice(referralCount * SUBSCRIPTION_CONFIG.referralDiscount)}
              </p>
              <p className="text-sm text-green-700">Monthly Savings</p>
            </div>
          </div>

          {currentCredits && currentCredits.credits_applied > 0 && (
            <div className="text-sm text-green-600">
              ✓ ${currentCredits.credits_applied} credit applied this month
            </div>
          )}
        </div>
      </div>
    </div>
  );
}