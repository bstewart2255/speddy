'use client';

import { useState } from 'react';
import { SignupForm } from './signup-form';
import { PaymentStep } from './payment-step';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [currentStep, setCurrentStep] = useState<'signup' | 'payment' | 'complete'>('signup');
  const [userRole, setUserRole] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const router = useRouter();

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

  const handlePaymentComplete = () => {
    router.push('/login');
  };

  const handlePaymentSkip = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header with Speddy logo */}
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <span className="text-4xl font-logo text-gray-900">Speddy</span>
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
                  Join your school site's collaborative scheduling platform
                </p>
              </div>
              <SignupForm onComplete={handleSignupComplete} />
            </>
          )}
          
          {currentStep === 'payment' && (
            <>
              <div className="mb-8">
                <h2 className="text-center text-3xl font-extrabold text-gray-900">
                  Complete Setup
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                  Start your free trial to access all features
                </p>
              </div>
              <PaymentStep 
                userEmail={userEmail} 
                onSkip={handlePaymentSkip}
              />
            </>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-600">
        Made by SpEd people, for SpEd people.
      </footer>
    </div>
  );
}