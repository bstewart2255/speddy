'use client';

import Link from 'next/link';
import { CareCaseWithDetails } from '@/lib/supabase/queries/care-cases';
import {
  CARE_STATUS_COLORS,
  CARE_CATEGORY_COLORS,
  CARE_CATEGORIES,
  type CareStatus,
  type CareCategory,
} from '@/lib/constants/care';

interface CaseDetailHeaderProps {
  caseData: CareCaseWithDetails;
}

export function CaseDetailHeader({ caseData }: CaseDetailHeaderProps) {
  const referral = caseData.care_referrals;
  const statusColor =
    CARE_STATUS_COLORS[referral.status as CareStatus] || CARE_STATUS_COLORS.active;
  const categoryColor = referral.category
    ? CARE_CATEGORY_COLORS[referral.category as CareCategory] || CARE_CATEGORY_COLORS.other
    : null;
  const categoryLabel = referral.category
    ? CARE_CATEGORIES.find((c) => c.value === referral.category)?.label
    : null;

  const submittedDate = new Date(referral.submitted_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const referrerName = referral.referring_user?.full_name || 'Unknown';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      {/* Back link */}
      <Link
        href="/dashboard/care"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to CARE Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{referral.student_name}</h1>
          <p className="text-lg text-gray-600">Grade {referral.grade}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColor}`}>
            {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
          </span>
          {categoryLabel && categoryColor && (
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${categoryColor}`}>
              {categoryLabel}
            </span>
          )}
        </div>
      </div>

      {/* Referral details */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
          Referral Reason
        </h2>
        <p className="text-gray-700 whitespace-pre-wrap">{referral.referral_reason}</p>
      </div>

      {/* Meta info */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-sm text-gray-500">
        <div>
          <span className="font-medium">Referred by:</span> {referrerName}
        </div>
        <div>
          <span className="font-medium">Submitted:</span> {submittedDate}
        </div>
        {caseData.follow_up_date && (
          <div>
            <span className="font-medium">Follow-up:</span>{' '}
            {new Date(caseData.follow_up_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        )}
        {caseData.assigned_user && (
          <div>
            <span className="font-medium">Assigned to:</span> {caseData.assigned_user.full_name}
          </div>
        )}
      </div>
    </div>
  );
}
