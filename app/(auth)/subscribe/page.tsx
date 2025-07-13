'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { CheckoutForm } from '@/app/components/payment/checkout-form';

export default function SubscribePage() {
  const [loading, setLoading] = useState(true);
  const [hasSubscription, setHasSubscription] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('user_id', user.id)
        .single();

      if (subscription && subscription.status !== 'canceled') {
        setHasSubscription(true);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  if (hasSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            You already have an active subscription
          </h1>
          <p className="text-gray-600 mb-6">
            Manage your subscription from your billing page.
          </p>
          <a
            href="/billing"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Go to Billing
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <span className="text-4xl font-logo text-gray-900">Speddy</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <CheckoutForm onSuccess={() => router.push('/dashboard?payment_success=true')} />
        </div>
      </div>
    </div>
  );
}