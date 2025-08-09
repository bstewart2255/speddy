'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '../../../app/components/providers/school-context';
import { getSchoolHours } from '../queries/school-hours';
import { getUnscheduledSessionsCount } from '../queries/schedule-sessions';
import type { Database } from '../../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];
type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface ScheduleData {
  students: Student[];
  sessions: ScheduleSession[];
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  schoolHours: any[];
  seaProfiles: Array<{ id: string; full_name: string; is_shared?: boolean }>;
  unscheduledCount: number;
  currentUserId: string | null;
  providerRole: string;
  loading: boolean;
  error: string | null;
}

export function useScheduleData() {
  const { currentSchool } = useSchool();
  const supabase = createClient<Database>();
  
  // Core data state
  const [data, setData] = useState<ScheduleData>({
    students: [],
    sessions: [],
    bellSchedules: [],
    specialActivities: [],
    schoolHours: [],
    seaProfiles: [],
    unscheduledCount: 0,
    currentUserId: null,
    providerRole: '',
    loading: true,
    error: null,
  });


  // Fetch all schedule data
  const fetchData = useCallback(async () => {
    if (!currentSchool) {
      setData(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      setData(prev => ({ ...prev, loading: true, error: null }));

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');


      // Parallel fetch all data
      const [
        studentsResult,
        bellResult,
        activitiesResult,
        schoolHoursData,
        unscheduledCountData
      ] = await Promise.all([
        // Students query
        supabase
          .from('students')
          .select('*')
          .eq('provider_id', user.id)
          .eq('school_site', currentSchool.school_site)
          .eq('school_district', currentSchool.school_district),
        
        // Bell schedules query - Using school_id
        (() => {
          let query = supabase
            .from('bell_schedules')
            .select('*')
            .eq('provider_id', user.id);
          if (currentSchool.school_id) {
            query = query.eq('school_id', currentSchool.school_id);
          }
          return query;
        })(),
        
        // Special activities query - Using school_id
        (() => {
          let query = supabase
            .from('special_activities')
            .select('*')
            .eq('provider_id', user.id);
          if (currentSchool.school_id) {
            query = query.eq('school_id', currentSchool.school_id);
          }
          return query;
        })(),
        
        // School hours
        getSchoolHours(currentSchool),
        
        // Unscheduled count
        getUnscheduledSessionsCount(currentSchool.school_site)
      ]);

      // Fetch sessions based on students
      const studentIds = studentsResult.data?.map(s => s.id) || [];
      const sessionsResult = await supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', user.id)
        .in('student_id', studentIds)
        .is('session_date', null);

      // Fetch SEA profiles if user is Resource Specialist
      let seaProfiles: Array<{ id: string; full_name: string; is_shared?: boolean }> = [];
      if (profile.role === 'resource') {
        try {
          // Get SEAs supervised by this provider
          const { data: supervisedSeas, error } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('supervising_provider_id', user.id)
            .eq('role', 'sea')
            .order('full_name', { ascending: true });

          if (error) {
            } else if (supervisedSeas) {
            seaProfiles = supervisedSeas.map(sea => ({
              id: sea.id,
              full_name: sea.full_name,
              is_shared: false
            }));
            
          }
        } catch (error) {
        }
      }

      setData({
        students: studentsResult.data || [],
        sessions: sessionsResult.data || [],
        bellSchedules: bellResult.data || [],
        specialActivities: activitiesResult.data || [],
        schoolHours: schoolHoursData,
        seaProfiles,
        unscheduledCount: unscheduledCountData,
        currentUserId: user.id,
        providerRole: profile.role,
        loading: false,
        error: null,
      });


    } catch (error) {
      setData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch schedule data',
      }));
    }
  }, [currentSchool, supabase]);

  // Initial data fetch
  useEffect(() => {
    if (currentSchool) {
      fetchData();
    }
  }, [currentSchool, fetchData]);


  // Real-time subscription
  useEffect(() => {
    if (!currentSchool || !data.currentUserId) return;

    const channel = supabase
      .channel('schedule-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_sessions',
          filter: `provider_id=eq.${data.currentUserId}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSchool, data.currentUserId, fetchData, supabase]);

  // Optimistic update function
  const optimisticUpdateSession = useCallback((sessionId: string, updates: Partial<ScheduleSession>) => {
    setData(prev => ({
      ...prev,
      sessions: prev.sessions.map(s => 
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    }));
  }, []);

  // Refresh functions
  const refreshSessions = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const refreshUnscheduledCount = useCallback(async () => {
    if (!currentSchool) return;
    
    try {
      const count = await getUnscheduledSessionsCount(currentSchool.school_site);
      setData(prev => ({ ...prev, unscheduledCount: count }));
    } catch (error) {
    }
  }, [currentSchool]);

  return {
    // Data
    ...data,
    
    // Actions
    refreshData: fetchData,
    refreshSessions,
    refreshUnscheduledCount,
    optimisticUpdateSession,
  };
}