'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSchool } from '@/app/components/providers/school-context';
import {
  getCareReferrals,
  addCareReferral,
  updateReferralStatus,
  softDeleteReferral,
  CareReferral,
} from '../queries/care-referrals';
import type { CareCategory, CareStatus } from '@/lib/constants/care';

interface CareDataState {
  referrals: {
    pending: CareReferral[];
    active: CareReferral[];
    initial: CareReferral[];
    closed: CareReferral[];
    all: CareReferral[];
  };
  loading: boolean;
  error: string | null;
}

interface UseCareDataOptions {
  teacherId?: string;
  /** Skip fetching data (useful when waiting for async dependencies like teacher record) */
  skip?: boolean;
}

interface UseCareDataReturn extends CareDataState {
  addReferral: (data: {
    student_name: string;
    grade: string;
    referral_reason: string;
    category?: CareCategory;
  }) => Promise<CareReferral>;
  updateStatus: (referralId: string, status: CareStatus) => Promise<void>;
  deleteReferral: (referralId: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

export function useCareData(options?: UseCareDataOptions): UseCareDataReturn {
  const teacherId = options?.teacherId;
  const skip = options?.skip ?? false;
  const { currentSchool } = useSchool();
  const [state, setState] = useState<CareDataState>({
    referrals: {
      pending: [],
      active: [],
      initial: [],
      closed: [],
      all: [],
    },
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    // Skip fetching if requested (e.g., waiting for teacher record)
    if (skip) {
      return;
    }

    if (!currentSchool?.school_id) {
      setState(prev => ({
        ...prev,
        loading: false,
        referrals: { pending: [], active: [], initial: [], closed: [], all: [] },
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const allReferrals = await getCareReferrals(currentSchool.school_id, undefined, teacherId);

      // Group by status
      const pending = allReferrals.filter(r => r.status === 'pending');
      const active = allReferrals.filter(r => r.status === 'active');
      const initial = allReferrals.filter(r => r.status === 'initial');
      const closed = allReferrals.filter(r => r.status === 'closed');

      setState({
        referrals: {
          pending,
          active,
          initial,
          closed,
          all: allReferrals,
        },
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error('Error fetching CARE data:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load CARE data',
      }));
    }
  }, [currentSchool?.school_id, teacherId, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addReferral = useCallback(
    async (data: {
      student_name: string;
      grade: string;
      teacher_id?: string;
      teacher_name?: string;
      referral_reason: string;
      category?: CareCategory;
    }): Promise<CareReferral> => {
      if (!currentSchool?.school_id) {
        throw new Error('No school selected');
      }

      // Call API first, then update state on success
      const referral = await addCareReferral({
        ...data,
        school_id: currentSchool.school_id,
        district_id: currentSchool.district_id || undefined,
        state_id: currentSchool.state_id || undefined,
      });

      // Update state only after successful API call
      setState(prev => ({
        ...prev,
        referrals: {
          ...prev.referrals,
          pending: [referral, ...prev.referrals.pending],
          all: [referral, ...prev.referrals.all],
        },
      }));

      return referral;
    },
    [currentSchool]
  );

  const updateStatus = useCallback(
    async (referralId: string, status: CareStatus): Promise<void> => {
      await updateReferralStatus(referralId, status);
      // Refresh to get updated data
      await fetchData();
    },
    [fetchData]
  );

  const deleteReferral = useCallback(
    async (referralId: string): Promise<void> => {
      // Call API first
      await softDeleteReferral(referralId);

      // Update state only after successful API call
      setState(prev => ({
        ...prev,
        referrals: {
          pending: prev.referrals.pending.filter(r => r.id !== referralId),
          active: prev.referrals.active.filter(r => r.id !== referralId),
          initial: prev.referrals.initial.filter(r => r.id !== referralId),
          closed: prev.referrals.closed.filter(r => r.id !== referralId),
          all: prev.referrals.all.filter(r => r.id !== referralId),
        },
      }));
    },
    []
  );

  return {
    ...state,
    addReferral,
    updateStatus,
    deleteReferral,
    refreshData: fetchData,
  };
}
