import { useState, useEffect, useCallback } from 'react';
import { getBellSchedulesForSchool } from '../../../../../../lib/supabase/queries/bell-schedules';
import { getSpecialActivities } from '../../../../../../lib/supabase/queries/special-activities';
import { getTeachers } from '../../../../../../lib/supabase/queries/teachers';
import { getYardDutyAssignments } from '../../../../../../lib/supabase/queries/yard-duty';
import { getSchoolStaffMembers, getSchoolProviders } from '../../../../../../lib/supabase/queries/staff';
import { getSchoolHoursBySchoolId } from '../../../../../../lib/supabase/queries/school-hours';
import { getInstructionSchedules } from '../../../../../../lib/supabase/queries/instruction-schedules';
import type { SpecialActivity, Teacher, YardDutyAssignment, SchoolHour, InstructionSchedule } from '@/src/types/database';
import type { StaffWithHours, ProviderOption } from '../../../../../../lib/supabase/queries/staff';
import type { BellScheduleWithCreator } from '../types';

interface UseAdminScheduleDataReturn {
  bellSchedules: BellScheduleWithCreator[];
  specialActivities: SpecialActivity[];
  teachers: Teacher[];
  yardDutyAssignments: YardDutyAssignment[];
  staffMembers: StaffWithHours[];
  providers: ProviderOption[];
  schoolHours: SchoolHour[];
  instructionSchedules: InstructionSchedule[];
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
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [schoolHours, setSchoolHours] = useState<SchoolHour[]>([]);
  const [instructionSchedules, setInstructionSchedules] = useState<InstructionSchedule[]>([]);
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

      // Fetch core schedule data in parallel
      const [bellScheduleData, activityData, teacherData] = await Promise.all([
        getBellSchedulesForSchool(schoolId, schoolYear),
        getSpecialActivities(schoolId, schoolYear),
        getTeachers(schoolId),
      ]);

      setBellSchedules(bellScheduleData || []);
      setSpecialActivities(activityData || []);
      setTeachers(teacherData || []);

      // Fetch yard duty, staff, providers, and school hours separately so permission errors don't block core data
      let yardDutyData: YardDutyAssignment[] = [];
      let staffData: StaffWithHours[] = [];
      let providerData: ProviderOption[] = [];
      let schoolHoursData: SchoolHour[] = [];
      let instructionData: InstructionSchedule[] = [];
      const results = await Promise.allSettled([
        getYardDutyAssignments(schoolId, schoolYear),
        getSchoolStaffMembers(schoolId),
        getSchoolProviders(schoolId),
        getSchoolHoursBySchoolId(schoolId),
        getInstructionSchedules(schoolId, schoolYear),
      ]);

      if (results[0].status === 'fulfilled') yardDutyData = results[0].value;
      else console.warn('Unable to fetch yard duty assignments:', results[0].reason);

      if (results[1].status === 'fulfilled') staffData = results[1].value;
      else console.warn('Unable to fetch staff members:', results[1].reason);

      if (results[2].status === 'fulfilled') providerData = results[2].value;
      else console.warn('Unable to fetch providers:', results[2].reason);

      if (results[3].status === 'fulfilled') schoolHoursData = results[3].value;
      else console.warn('Unable to fetch school hours:', results[3].reason);

      if (results[4].status === 'fulfilled') instructionData = results[4].value;
      else console.warn('Unable to fetch instruction schedules:', results[4].reason);

      setYardDutyAssignments(yardDutyData || []);
      setStaffMembers(staffData || []);
      setProviders(providerData || []);
      setSchoolHours(schoolHoursData || []);
      setInstructionSchedules(instructionData || []);
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
    providers,
    schoolHours,
    instructionSchedules,
    loading,
    error,
    refreshData: fetchData
  };
}
