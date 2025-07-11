'use client';

import { useState } from 'react';
import { getStripe } from '@/src/lib/stripe-client';
import { formatPrice, SUBSCRIPTION_CONFIG } from '@/src/lib/stripe';

interface CheckoutFormProps {
  onSuccess?: () => void;
}

export function CheckoutForm({ onSuccess }: CheckoutFormProps) {
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          promo_code: promoCode || undefined,
        }),
      });

      const { sessionId, error: apiError } = await response.json();

      if (apiError) {
        setError(apiError);
        return;
      }

      const stripe = await getStripe();
      if (!stripe) {
        setError('Failed to load payment system');
        return;
      }

      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });

      if (stripeError) {
        setError(stripeError.message || 'Payment failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Subscription Details</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Monthly Price</span>
            <span className="text-2xl font-bold text-gray-900">
              {formatPrice(SUBSCRIPTION_CONFIG.monthlyPrice)}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Trial Period</span>
            <span className="font-medium text-green-600">
              {SUBSCRIPTION_CONFIG.trialDays} days free
            </span>
          </div>
          
          <div className="pt-3 border-t">
            <p className="text-sm text-gray-500">
              You won't be charged until your trial ends. Cancel anytime.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <label htmlFor="promo-code" className="block text-sm font-medium text-gray-700 mb-1">
            Referral Code (optional)
          </label>
          <input
            type="text"
            id="promo-code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder="Enter referral code"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Have a referral code? Enter it here to support another educator!
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </>
        ) : (
          'Start Free Trial'
        )}
      </button>

      <div className="text-center text-sm text-gray-500">
        <p>Secure payment powered by Stripe</p>
        <p className="mt-1">
          By subscribing, you agree to our{' '}
          <a href="/terms" className="text-blue-600 hover:text-blue-500">
            Terms of Service
          </a>
        </p>
      </div>
    </form>
  );
}