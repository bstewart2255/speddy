'use client';

import { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { ReferralProgramModal } from '../components/referral-program-modal';

function ReferralProgramContent() {
  const router = useRouter();

  useEffect(() => {
    // Add query param to trigger modal
    router.push('/?referral-program=true');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Redirecting...</p>
      <ReferralProgramModal />
    </div>
  );
}

export default function ReferralProgramPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>}>
      <ReferralProgramContent />
    </Suspense>
  );
}