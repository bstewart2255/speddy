'use client';

import { useState } from 'react';
import { CheckoutForm } from '@/app/components/payment/checkout-form';
import { useRouter } from 'next/navigation';

interface PaymentStepProps {
  userEmail: string;
  onSkip?: () => void;
}

export function PaymentStep({ userEmail, onSkip }: PaymentStepProps) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);

  const handleSkip = async () => {
    setSkipping(true);
    // For now, allow skipping payment during initial launch
    // This can be removed later to require payment
    if (onSkip) {
      onSkip();
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Complete Your Setup
        </h2>
        <p className="text-gray-600">
          Start your free trial to access all features
        </p>
      </div>

      <CheckoutForm 
        onSuccess={() => router.push('/dashboard?payment_success=true')} 
      />

      {/* Temporary skip option for soft launch */}
      <div className="mt-6 text-center">
        <button
          onClick={handleSkip}
          disabled={skipping}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          {skipping ? 'Continuing...' : 'Skip for now (limited features)'}
        </button>
      </div>
    </div>
  );
}