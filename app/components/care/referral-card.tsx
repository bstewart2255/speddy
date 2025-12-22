'use client';

import { CareReferral } from '@/lib/supabase/queries/care-referrals';
import {
  CARE_STATUS_COLORS,
  CARE_CATEGORY_COLORS,
  CARE_CATEGORIES,
  type CareStatus,
  type CareCategory,
} from '@/lib/constants/care';

interface ReferralCardProps {
  referral: CareReferral;
  onClick?: () => void;
  onActivate?: () => void;
  onDelete?: () => void;
}

export function ReferralCard({ referral, onClick, onActivate, onDelete }: ReferralCardProps) {
  const statusColor = CARE_STATUS_COLORS[referral.status as CareStatus] || CARE_STATUS_COLORS.pending;
  const categoryColor = referral.category
    ? CARE_CATEGORY_COLORS[referral.category as CareCategory] || CARE_CATEGORY_COLORS.other
    : null;
  const categoryLabel = referral.category
    ? CARE_CATEGORIES.find((c) => c.value === referral.category)?.label
    : null;

  const submittedDate = new Date(referral.submitted_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const referrerName = referral.referring_user?.full_name || 'Unknown';

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg p-4 ${
        onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-gray-900 truncate">{referral.student_name}</h3>
            <span className="text-sm text-gray-500">Grade {referral.grade}</span>
          </div>

          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{referral.referral_reason}</p>

          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-gray-500">Referred by {referrerName}</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{submittedDate}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>
            {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
          </span>
          {categoryLabel && categoryColor && (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${categoryColor}`}>
              {categoryLabel}
            </span>
          )}
        </div>
      </div>

      {(onActivate || onDelete) && referral.status === 'pending' && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
          {onActivate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onActivate();
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Start Case
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
