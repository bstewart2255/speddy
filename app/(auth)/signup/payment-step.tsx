'use client';

import { CheckoutForm } from '@/app/components/payment/checkout-form';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PaymentStepProps {
  userEmail: string;
  showSubscriptionRequired?: boolean;
}

export function PaymentStep({ userEmail, showSubscriptionRequired }: PaymentStepProps) {
  const router = useRouter();
  const supabase = createClient();
  const [showMessage, setShowMessage] = useState(showSubscriptionRequired);

  useEffect(() => {
    console.log('PaymentStep mounted, showSubscriptionRequired:', showSubscriptionRequired);
    console.log('Current URL:', window.location.href);

    // Persist the message in state
    if (showSubscriptionRequired) {
      setShowMessage(true);
    }

    // If no email provided, check if user is authenticated
    const checkAuth = async () => {
      if (!userEmail) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // No user session, redirect to signup
          router.push('/signup');
        }
      }
    };

    checkAuth();
  }, [userEmail, router, supabase, showSubscriptionRequired]);

  return (
    <div className="max-w-md mx-auto">
      {showMessage && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Please complete your subscription to access Speddy.
          </p>
        </div>
      )}

      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Complete Your Setup
        </h2>
        <p className="text-gray-600">
          Start your 30-day free trial - no charges today
        </p>
      </div>

      <CheckoutForm 
        onSuccess={() => router.push('/dashboard?payment_success=true')} 
      />
    </div>
  );
}