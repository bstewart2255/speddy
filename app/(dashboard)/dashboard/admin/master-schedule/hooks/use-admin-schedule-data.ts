import { useState, useEffect, useCallback } from 'react';
import { getBellSchedulesForSchool } from '../../../../../../lib/supabase/queries/bell-schedules';
import { getSpecialActivities } from '../../../../../../lib/supabase/queries/special-activities';
import { getTeachers } from '../../../../../../lib/supabase/queries/teachers';
import type { SpecialActivity, Teacher } from '@/src/types/database';
import type { BellScheduleWithCreator } from '../types';

interface UseAdminScheduleDataReturn {
  bellSchedules: BellScheduleWithCreator[];
  specialActivities: SpecialActivity[];
  teachers: Teacher[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
}

export function useAdminScheduleData(schoolId: string | null): UseAdminScheduleDataReturn {
  const [bellSchedules, setBellSchedules] = useState<BellScheduleWithCreator[]>([]);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [bellScheduleData, activityData, teacherData] = await Promise.all([
        getBellSchedulesForSchool(schoolId),
        getSpecialActivities(schoolId),
        getTeachers()
      ]);

      setBellSchedules(bellScheduleData || []);
      setSpecialActivities(activityData || []);
      setTeachers(teacherData || []);
    } catch (err) {
      console.error('Error fetching schedule data:', err);
      setError('Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    bellSchedules,
    specialActivities,
    teachers,
    loading,
    error,
    refreshData: fetchData
  };
}
