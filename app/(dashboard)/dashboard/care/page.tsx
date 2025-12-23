'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSchool } from '@/app/components/providers/school-context';
import { useCareData } from '@/lib/supabase/hooks/use-care-data';
import { AddReferralModal } from '@/app/components/care/add-referral-modal';
import { ReferralList } from '@/app/components/care/referral-list';
import { CareReferral } from '@/lib/supabase/queries/care-referrals';
import { getAssignableUsers, updateCase, AssignableUser } from '@/lib/supabase/queries/care-cases';
import type { CareStatus } from '@/lib/constants/care';

type TabType = 'pending' | 'active' | 'closed';

export default function CareDashboardPage() {
  const router = useRouter();
  const { currentSchool, loading: schoolLoading } = useSchool();
  const { referrals, loading, error, addReferral, updateStatus, deleteReferral, refreshData } =
    useCareData();

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);

  // Fetch assignable users when school changes
  useEffect(() => {
    if (currentSchool?.school_id) {
      getAssignableUsers(currentSchool.school_id)
        .then(setAssignableUsers)
        .catch((err) => {
          console.error('Error fetching assignable users:', err);
          setAssignableUsers([]);
        });
    }
  }, [currentSchool?.school_id]);

  const handleAddReferral = useCallback(
    async (data: {
      student_name: string;
      grade: string;
      referral_reason: string;
      category?: string;
    }) => {
      setActionError(null);
      try {
        await addReferral(data as Parameters<typeof addReferral>[0]);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to add referral');
        throw err; // Re-throw so the modal knows it failed
      }
    },
    [addReferral]
  );

  const handleActivateReferral = useCallback(
    async (referral: CareReferral) => {
      setActionError(null);
      try {
        await updateStatus(referral.id, 'active' as CareStatus);
        // Navigate to the case detail page
        // Need to refetch to get the case ID
        await refreshData();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to activate referral');
      }
    },
    [updateStatus, refreshData]
  );

  const handleDeleteReferral = useCallback(
    async (referral: CareReferral) => {
      if (!confirm('Are you sure you want to delete this referral? This action cannot be undone.')) {
        return;
      }
      setActionError(null);
      try {
        await deleteReferral(referral.id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to delete referral');
      }
    },
    [deleteReferral]
  );

  const handleReferralClick = useCallback(
    (referral: CareReferral) => {
      // Navigate if there's a case (active or closed referrals)
      // care_cases can be an array or single object due to UNIQUE constraint
      const cases = referral.care_cases;
      if (cases) {
        const caseId = Array.isArray(cases) ? cases[0]?.id : cases.id;
        if (caseId) {
          router.push(`/dashboard/care/${caseId}`);
        }
      }
    },
    [router]
  );

  const handleAssign = useCallback(
    async (caseId: string, userId: string | null) => {
      setActionError(null);
      try {
        await updateCase(caseId, { assigned_to: userId });
        await refreshData();
      } catch (err) {
        console.error('Error assigning case:', err);
        setActionError(err instanceof Error ? err.message : 'Failed to assign case');
      }
    },
    [refreshData]
  );

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: referrals.pending.length },
    { key: 'active', label: 'Active', count: referrals.active.length },
    { key: 'closed', label: 'Closed', count: referrals.closed.length },
  ];

  const currentReferrals = referrals[activeTab];

  if (schoolLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!currentSchool) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          Please select a school to view CARE referrals.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CARE Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Child Assistance Response in Education
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Referral
        </button>
      </div>

      {/* Error message */}
      {(error || actionError) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error || actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <ReferralList
          referrals={currentReferrals}
          emptyMessage={
            activeTab === 'pending'
              ? 'No pending referrals. Click "Add Referral" to create one.'
              : activeTab === 'active'
              ? 'No active cases.'
              : 'No closed cases.'
          }
          onReferralClick={handleReferralClick}
          onActivate={activeTab === 'pending' ? handleActivateReferral : undefined}
          onDelete={activeTab === 'pending' ? handleDeleteReferral : undefined}
          onAssign={activeTab === 'active' ? handleAssign : undefined}
          assignableUsers={activeTab === 'active' ? assignableUsers : undefined}
        />
      )}

      {/* Add Referral Modal */}
      <AddReferralModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddReferral}
      />
    </div>
  );
}
