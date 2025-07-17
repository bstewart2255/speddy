'use client';

import { useState, useEffect } from 'react';
import { SubscriptionManager } from '@/app/components/billing/subscription-manager';
import { ReferralCodeDisplay } from '@/app/components/profile';
import { ReferralProgramModal } from '@/app/components/referral-program-modal';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/components/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';

export default function BillingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [userRole, setUserRole] = useState<string>('');
  const [showReferralSection, setShowReferralSection] = useState(false);
  const supabase = createClient();

  const handleLearnMoreClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Add query parameter to current page instead of navigating away
    router.push('/billing?referral-program=true');
  };

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);
        const teacherRoles = ['resource', 'speech', 'ot', 'counseling', 'specialist'];
        setShowReferralSection(teacherRoles.includes(profile.role));
      }
    };

    fetchUserRole();
  }, [user, supabase]);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Billing & Subscription</h1>
      <SubscriptionManager />
      
      {/* Referral Program Section - Only for teachers */}
      {showReferralSection && (
        <div className="mt-8 space-y-4">
          <ReferralCodeDisplay />
          <div className="flex items-center justify-center gap-2">
            <Info className="w-4 h-4 text-gray-500" />
            <button 
              onClick={handleLearnMoreClick}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Learn more about earning rewards through referrals
            </button>
          </div>
        </div>
      )}
      
      {/* Include the modal component */}
      <ReferralProgramModal />
    </div>
  );
}