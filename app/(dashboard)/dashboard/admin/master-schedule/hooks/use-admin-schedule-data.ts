import { useState, useEffect, useCallback } from 'react';
import { getBellSchedulesForSchool } from '../../../../../../lib/supabase/queries/bell-schedules';
import { getSpecialActivities } from '../../../../../../lib/supabase/queries/special-activities';
import { getTeachers } from '../../../../../../lib/supabase/queries/teachers';
import { getYardDutyAssignments } from '../../../../../../lib/supabase/queries/yard-duty';
import { getSchoolStaffMembers } from '../../../../../../lib/supabase/queries/staff';
import type { SpecialActivity, Teacher, YardDutyAssignment } from '@/src/types/database';
import type { StaffWithHours } from '../../../../../../lib/supabase/queries/staff';
import type { BellScheduleWithCreator } from '../types';

interface UseAdminScheduleDataReturn {
  bellSchedules: BellScheduleWithCreator[];
  specialActivities: SpecialActivity[];
  teachers: Teacher[];
  yardDutyAssignments: YardDutyAssignment[];
  staffMembers: StaffWithHours[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
}

export function useAdminScheduleData(schoolId: string | null, schoolYear?: string): UseAdminScheduleDataReturn {
  const [bellSchedules, setBellSchedules] = useState<BellScheduleWithCreator[]>([]);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [yardDutyAssignments, setYardDutyAssignments] = useState<YardDutyAssignment[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffWithHours[]>([]);
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
      const [bellScheduleData, activityData, teacherData, yardDutyData, staffData] = await Promise.all([
        getBellSchedulesForSchool(schoolId, schoolYear),
        getSpecialActivities(schoolId, schoolYear),
        getTeachers(schoolId),
        getYardDutyAssignments(schoolId, schoolYear),
        getSchoolStaffMembers(schoolId),
      ]);

      setBellSchedules(bellScheduleData || []);
      setSpecialActivities(activityData || []);
      setTeachers(teacherData || []);
      setYardDutyAssignments(yardDutyData || []);
      setStaffMembers(staffData || []);
    } catch (err) {
      console.error('Error fetching schedule data:', err);
      setError('Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  }, [schoolId, schoolYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    bellSchedules,
    specialActivities,
    teachers,
    yardDutyAssignments,
    staffMembers,
    loading,
    error,
    refreshData: fetchData
  };
}
