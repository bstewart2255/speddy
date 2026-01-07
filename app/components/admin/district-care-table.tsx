'use client';

import { useRouter } from 'next/navigation';
import { DistrictCareReferral } from '@/lib/supabase/queries/care-referrals';
import {
  CARE_STATUS_COLORS,
  CARE_CATEGORY_COLORS,
  CARE_CATEGORIES,
  CARE_DISPOSITIONS,
  type CareStatus,
  type CareCategory,
  type CareDisposition,
} from '@/lib/constants/care';

interface DistrictCareTableProps {
  referrals: DistrictCareReferral[];
  isLoading?: boolean;
}

export function DistrictCareTable({ referrals, isLoading }: DistrictCareTableProps) {
  const router = useRouter();

  const handleRowClick = (referral: DistrictCareReferral) => {
    if (referral.case_id) {
      router.push(`/dashboard/care/${referral.case_id}`);
    }
  };

  const getStatusLabel = (status: CareStatus) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getCategoryLabel = (category: CareCategory | null) => {
    if (!category) return null;
    return CARE_CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  const getDispositionLabel = (disposition: CareDisposition | null) => {
    if (!disposition) return '-';
    return CARE_DISPOSITIONS.find((d) => d.value === disposition)?.label || disposition;
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-64 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (referrals.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
        No CARE referrals found.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Student
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Grade
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                School
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stage
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {referrals.map((referral) => {
              const statusColor = CARE_STATUS_COLORS[referral.status] || CARE_STATUS_COLORS.pending;
              const categoryColor = referral.category
                ? CARE_CATEGORY_COLORS[referral.category] || CARE_CATEGORY_COLORS.other
                : null;
              const categoryLabel = getCategoryLabel(referral.category);
              const dispositionLabel = getDispositionLabel(referral.current_disposition);
              const hasCase = !!referral.case_id;

              return (
                <tr
                  key={referral.id}
                  className={hasCase ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}
                  onClick={() => hasCase && handleRowClick(referral)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      {referral.student_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-600">{referral.grade}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-600">
                      {referral.school_name || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>
                      {getStatusLabel(referral.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {categoryLabel && categoryColor ? (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${categoryColor}`}>
                        {categoryLabel}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-600">{dispositionLabel}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
