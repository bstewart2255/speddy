'use client';

import { Suspense } from 'react';
import { SignupForm } from './signup-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function SignupContent() {
  const router = useRouter();

  const handleSignupComplete = (_role: string, _email: string) => {
    router.push('/login');
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
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Create your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Let Speddy start lowering your stress levels
            </p>
          </div>
          <SignupForm onComplete={handleSignupComplete} />
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-600">
        Made by SpEd people, for SpEd people.
      </footer>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SignupContent />
    </Suspense>
  );
}
