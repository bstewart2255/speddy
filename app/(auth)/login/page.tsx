import { Suspense } from 'react';
import Image from 'next/image';
import LoginForm from './login-form';
import { TimeoutMessage } from '../../components/auth/timeout-message';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Hero logo, replacing the wordmark + tagline + sub-line.
              The artwork is taller than it is wide, so it's capped by height as
              well as width: on a short laptop screen a width-only cap pushes the
              sign-in button below the fold. Export replacements as a tightly
              cropped PNG with a transparent background — baked-in white shows up
              as a rectangle against this page's bg-gray-50. */}
          <div className="flex justify-center">
            <Image
              src="/speddy-hero.png"
              alt="Speddy — software for special education pros"
              width={968}
              height={1120}
              priority
              className="w-auto h-auto max-w-[17rem] max-h-[38vh] sm:max-w-[19rem]"
            />
          </div>

          <Suspense>
            <TimeoutMessage />
          </Suspense>
          
          <LoginForm />
        </div>
      </div>
      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-600">
        Made by SpEd people.
      </footer>
    </div>
  );
}