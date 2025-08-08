'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '../../../app/components/providers/school-context';
import { getSchoolHours } from '../queries/school-hours';
import { getUnscheduledSessionsCount } from '../queries/schedule-sessions';
import { useSchedulingData } from './use-scheduling-data';
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

  // Use existing scheduling data hook
  const {
    getExistingSessions,
    getBellScheduleConflicts,
    getSpecialActivityConflicts,
    isSlotAvailable,
    getSlotCapacity,
    refresh: refreshSchedulingData,
    isInitialized: isDataManagerInitialized,
    isLoading: isDataManagerLoading,
    error: dataManagerError,
    isCacheStale,
    metrics
  } = useSchedulingData();

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

      // Build optimized queries
      const queryStrategy = currentSchool.is_migrated ? 'optimized' : 'legacy';
      console.log(`[useScheduleData] Using ${queryStrategy} query strategy`);

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
      // Include both supervised SEAs and school-shared SEAs
      let seaProfiles: Array<{ id: string; full_name: string; is_shared?: boolean }> = [];
      if (profile.role === 'resource') {
        // Get user's school info for shared SEAs
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('school_district, school_site')
          .eq('id', user.id)
          .single();

        if (userProfile) {
          // Fetch both supervised and shared SEAs in parallel
          const [supervisedResult, sharedResult] = await Promise.all([
            // Supervised SEAs (existing relationship)
            supabase
              .from('profiles')
              .select('id, full_name')
              .eq('supervising_provider_id', user.id)
              .eq('role', 'sea')
              .order('full_name', { ascending: true }),
            
            // Shared SEAs at the same school
            supabase
              .from('profiles')
              .select('id, full_name, supervising_provider_id')
              .eq('role', 'sea')
              .eq('shared_at_school', true)
              .eq('school_district', userProfile.school_district)
              .eq('school_site', userProfile.school_site)
              .neq('supervising_provider_id', user.id) // Exclude ones already supervised by this user
              .order('full_name', { ascending: true })
          ]);

          // Combine and deduplicate SEAs
          const supervisedSeas = (supervisedResult.data || []).map(sea => ({
            ...sea,
            is_shared: false
          }));
          
          const sharedSeas = (sharedResult.data || []).map(sea => ({
            ...sea,
            is_shared: true
          }));
          
          // Combine lists, supervised SEAs first
          seaProfiles = [...supervisedSeas, ...sharedSeas];
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

      console.log('[useScheduleData] Data loaded:', {
        students: studentsResult.data?.length || 0,
        sessions: sessionsResult.data?.length || 0,
        bellSchedules: bellResult.data?.length || 0,
        specialActivities: activitiesResult.data?.length || 0,
        unscheduledCount: unscheduledCountData,
      });

    } catch (error) {
      console.error('[useScheduleData] Error fetching data:', error);
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

  // Sync with data manager when initialized
  useEffect(() => {
    if (isDataManagerInitialized && !isDataManagerLoading) {
      const cachedSessions = getExistingSessions();
      if (cachedSessions.length > 0) {
        setData(prev => ({
          ...prev,
          sessions: cachedSessions as ScheduleSession[],
        }));
        console.log('[useScheduleData] Synced with data manager:', cachedSessions.length);
      }
      
      if (isCacheStale) {
        refreshSchedulingData().catch(console.error);
      }
    }
  }, [isDataManagerInitialized, isDataManagerLoading, getExistingSessions, isCacheStale, refreshSchedulingData]);

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
        (payload) => {
          console.log('[useScheduleData] Real-time update:', payload);
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
    if (isDataManagerInitialized) {
      await refreshSchedulingData();
    }
  }, [fetchData, isDataManagerInitialized, refreshSchedulingData]);

  const refreshUnscheduledCount = useCallback(async () => {
    if (!currentSchool) return;
    
    try {
      const count = await getUnscheduledSessionsCount(currentSchool.school_site);
      setData(prev => ({ ...prev, unscheduledCount: count }));
    } catch (error) {
      console.error('[useScheduleData] Error refreshing unscheduled count:', error);
    }
  }, [currentSchool]);

  return {
    // Data
    ...data,
    
    // Data manager functions
    getBellScheduleConflicts,
    getSpecialActivityConflicts,
    isSlotAvailable,
    getSlotCapacity,
    
    // State
    isDataManagerInitialized,
    isDataManagerLoading,
    dataManagerError,
    isCacheStale,
    metrics,
    
    // Actions
    refreshData: fetchData,
    refreshSessions,
    refreshUnscheduledCount,
    optimisticUpdateSession,
  };
}