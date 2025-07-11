'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ReferralProgramModal } from '../components/referral-program-modal';

export default function ReferralProgramPage() {
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