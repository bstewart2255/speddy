'use client';

import { CheckoutForm } from '@/app/components/payment/checkout-form';
import { useRouter } from 'next/navigation';

interface PaymentStepProps {
  userEmail: string;
}

export function PaymentStep({ userEmail }: PaymentStepProps) {
  const router = useRouter();

  return (
    <div className="max-w-md mx-auto">
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