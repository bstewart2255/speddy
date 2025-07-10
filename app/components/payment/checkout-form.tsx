'use client';

import { useState } from 'react';
import { getStripe } from '@/src/lib/stripe-client';
import { formatPrice, SUBSCRIPTION_CONFIG } from '@/src/lib/stripe';

interface CheckoutFormProps {
  onSuccess?: () => void;
  referralCode?: string;
}

export function CheckoutForm({ onSuccess, referralCode: initialCode }: CheckoutFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState(initialCode || '');
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeValid, setCodeValid] = useState<boolean | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      // Create checkout session
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ referralCode: referralCode.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      const stripe = await getStripe();
      if (stripe) {
        const { error: stripeError } = await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        });
        
        if (stripeError) {
          throw stripeError;
        }
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  const validateReferralCode = async () => {
    if (!referralCode.trim()) {
      setCodeValid(null);
      return;
    }

    setValidatingCode(true);
    try {
      const response = await fetch('/api/referral/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: referralCode.trim() }),
      });

      const data = await response.json();
      setCodeValid(data.valid);
    } catch (err) {
      setCodeValid(false);
    } finally {
      setValidatingCode(false);
    }
  };

  const trialDays = codeValid ? SUBSCRIPTION_CONFIG.extendedTrialPeriodDays : SUBSCRIPTION_CONFIG.trialPeriodDays;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          Start Your Free Trial
        </h3>
        <p className="text-blue-800">
          {trialDays}-day free trial • {formatPrice(SUBSCRIPTION_CONFIG.monthlyPrice)}/month after trial
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="referralCode" className="block text-sm font-medium text-gray-700 mb-1">
          Referral Code (Optional)
        </label>
        <div className="flex gap-2">
          <input
            id="referralCode"
            type="text"
            value={referralCode}
            onChange={(e) => {
              setReferralCode(e.target.value.toUpperCase());
              setCodeValid(null);
            }}
            onBlur={validateReferralCode}
            placeholder="Enter code"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={loading}
          />
          {validatingCode && (
            <span className="text-sm text-gray-500 py-2">Checking...</span>
          )}
        </div>
        
        {codeValid === true && (
          <p className="mt-1 text-sm text-green-600">
            ✓ Valid code! You'll get 60 days free instead of 30.
          </p>
        )}
        {codeValid === false && (
          <p className="mt-1 text-sm text-red-600">
            Invalid code. You'll still get 30 days free.
          </p>
        )}
        {!referralCode && (
          <p className="mt-1 text-sm text-gray-500">
            Have a referral code? Enter it to get 60 days free!
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-gray-900">What's included:</h4>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Unlimited student profiles</li>
            <li>• AI-powered lesson planning</li>
            <li>• Progress tracking & reports</li>
            <li>• Team collaboration features</li>
            <li>• Summer pause option (June & July)</li>
            <li>• Cancel anytime</li>
          </ul>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-medium text-gray-900 mb-2">Referral Program:</h4>
          <p className="text-sm text-gray-700">
            Share your referral code with colleagues and earn $1 off your monthly subscription for each active referral!
          </p>
        </div>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Processing...' : `Start ${trialDays}-Day Free Trial`}
      </button>

      <p className="text-xs text-center text-gray-500">
        No payment required during trial • Cancel anytime
      </p>
    </div>
  );
}