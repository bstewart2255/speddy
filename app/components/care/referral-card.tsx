'use client';

import { CareReferral } from '@/lib/supabase/queries/care-referrals';
import { AssignableUser } from '@/lib/supabase/queries/care-cases';
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
  onAssign?: (caseId: string, userId: string | null) => void;
  assignableUsers?: AssignableUser[];
}

export function ReferralCard({
  referral,
  onClick,
  onActivate,
  onDelete,
  onAssign,
  assignableUsers,
}: ReferralCardProps) {
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

  // Get the case data (can be array or single object due to UNIQUE constraint)
  const caseData = referral.care_cases
    ? Array.isArray(referral.care_cases)
      ? referral.care_cases[0]
      : referral.care_cases
    : null;

  const currentAssignee = caseData?.assigned_user?.full_name || null;
  const currentAssigneeId = caseData?.assigned_to || '';

  const handleAssignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    if (onAssign && caseData) {
      const value = e.target.value;
      onAssign(caseData.id, value || null);
    }
  };

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
            {referral.teacher_name && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-sm text-gray-500">{referral.teacher_name}</span>
              </>
            )}
          </div>

          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{referral.referral_reason}</p>

          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-gray-500">Referred by {referrerName}</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{submittedDate}</span>
          </div>

          {/* Assignment dropdown for active cases */}
          {referral.status === 'active' && onAssign && assignableUsers && (
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor={`assign-${referral.id}`} className="text-xs text-gray-600">
                Assigned to:
              </label>
              <select
                id={`assign-${referral.id}`}
                value={currentAssigneeId}
                onChange={handleAssignChange}
                onClick={(e) => e.stopPropagation()}
                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Unassigned</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || 'Unknown'} ({user.type === 'admin' ? 'Admin' : user.role || 'Provider'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Show assigned user for closed cases (read-only) */}
          {referral.status === 'closed' && currentAssignee && (
            <div className="mt-2 text-xs text-gray-500">
              Assigned to: {currentAssignee}
            </div>
          )}
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
