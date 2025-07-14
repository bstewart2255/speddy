'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignupForm } from './signup-form';
import { PaymentStep } from './payment-step';
import { useRouter } from 'next/navigation';
import { ReferralProgramModal } from '../../components/referral-program-modal';
import Link from 'next/link';

export default function SignupPage() {
  const [currentStep, setCurrentStep] = useState<'signup' | 'payment' | 'complete'>('signup');
  const [userRole, setUserRole] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if user was redirected here for payment
    if (searchParams.get('step') === 'payment' && searchParams.get('subscription_required') === 'true') {
      setCurrentStep('payment');
    }
  }, [searchParams]);

  const handleSignupComplete = (role: string, email: string) => {
    setUserRole(role);
    setUserEmail(email);

    // Skip payment for SEA users
    if (role === 'sea') {
      router.push('/login');
    } else {
      setCurrentStep('payment');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header with Speddy logo */}
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <Link 
          href="/login" 
          className="text-4xl font-logo text-gray-900 hover:text-gray-700 transition-colors cursor-pointer"
        >
          Speddy
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {currentStep === 'signup' && (
            <>
              <div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                  Create your account
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                  Let Speddy start lowering your stress levels
                </p>
              </div>
              <SignupForm onComplete={handleSignupComplete} />
            </>
          )}

          {currentStep === 'payment' && (
            <>
              <PaymentStep 
                userEmail={userEmail} 
                showSubscriptionRequired={searchParams.get('subscription_required') === 'true'}
              />
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-600">
        Made by SpEd people, for SpEd people.
      </footer>
      {/* Add the referral modal */}
      <ReferralProgramModal />
    </div>
  );
}