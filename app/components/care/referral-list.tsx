'use client';

import { CareReferral } from '@/lib/supabase/queries/care-referrals';
import { ReferralCard } from './referral-card';

interface ReferralListProps {
  referrals: CareReferral[];
  emptyMessage?: string;
  onReferralClick?: (referral: CareReferral) => void;
  onActivate?: (referral: CareReferral) => void;
  onDelete?: (referral: CareReferral) => void;
}

export function ReferralList({
  referrals,
  emptyMessage = 'No referrals found',
  onReferralClick,
  onActivate,
  onDelete,
}: ReferralListProps) {
  if (referrals.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-2 text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {referrals.map((referral) => (
        <ReferralCard
          key={referral.id}
          referral={referral}
          onClick={onReferralClick ? () => onReferralClick(referral) : undefined}
          onActivate={onActivate ? () => onActivate(referral) : undefined}
          onDelete={onDelete ? () => onDelete(referral) : undefined}
        />
      ))}
    </div>
  );
}
