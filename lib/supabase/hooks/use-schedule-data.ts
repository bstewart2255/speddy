'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '../../../app/components/providers/school-context';
import { getSchoolHours } from '../queries/school-hours';
import { getUnscheduledSessionsCount } from '../queries/schedule-sessions';
import { useSchedulingData } from './use-scheduling-data';
import { isScheduledSession } from '@/lib/utils/session-helpers';
import type { Database, SchoolHour } from '../../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];
type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface ScheduleData {
  students: Student[];
  sessions: ScheduleSession[];
  unscheduledSessions: ScheduleSession[];
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  schoolHours: SchoolHour[];
  seaProfiles: Array<{ id: string; full_name: string; is_shared?: boolean }>;
  otherSpecialists: Array<{ id: string; full_name: string; role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' }>;
  unscheduledCount: number;
  currentUserId: string | null;
  providerRole: string;
  loading: boolean;
  error: string | null;
}

export function useScheduleData() {
  const { currentSchool } = useSchool();
  
  // Core data state
  const [data, setData] = useState<ScheduleData>({
    students: [],
    sessions: [],
    unscheduledSessions: [],
    bellSchedules: [],
    specialActivities: [],
    schoolHours: [],
    seaProfiles: [],
    otherSpecialists: [],
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

    const supabase = createClient<Database>();

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
        // Students query - Using school_id if available (normalized), else legacy fields
        (() => {
          let query = supabase
            .from('students')
            .select('*')
            .eq('provider_id', user.id);
          if (currentSchool.school_id) {
            query = query.eq('school_id', currentSchool.school_id);
          } else {
            // Legacy schools without school_id
            query = query
              .eq('school_site', currentSchool.school_site)
              .eq('school_district', currentSchool.school_district);
          }
          return query;
        })(),
        
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
        
        // Special activities query - School-wide (all providers see all activities)
        // Exclude soft-deleted activities
        (() => {
          let query = supabase
            .from('special_activities')
            .select('*')
            .is('deleted_at', null);
          if (currentSchool.school_id) {
            query = query.eq('school_id', currentSchool.school_id);
          }
          return query;
        })(),
        
        // School hours
        getSchoolHours(currentSchool),

        // Unscheduled count
        getUnscheduledSessionsCount(currentSchool)
      ]);

      // Fetch sessions based on students
      const studentIds = studentsResult.data?.map(s => s.id) || [];

      // For specialist users, also fetch sessions assigned to them (even from other providers' students)
      let sessionsResult;
      if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(profile.role)) {
        // Fetch sessions where:
        // 1. Student belongs to this user (any sessions for my students)
        // 2. OR assigned to this user (sessions assigned to me, regardless of whose students)
        if (studentIds.length > 0) {
          sessionsResult = await supabase
            .from('schedule_sessions')
            .select('*')
            .or(`student_id.in.(${studentIds.join(',')}),assigned_to_specialist_id.eq.${user.id}`)
            .is('session_date', null)
            .limit(10000);
        } else {
          // No students, only fetch assigned sessions
          sessionsResult = await supabase
            .from('schedule_sessions')
            .select('*')
            .eq('assigned_to_specialist_id', user.id)
            .is('session_date', null)
            .limit(10000);
        }

        // Filter assigned sessions to only include those for students at the current school
        if (sessionsResult.data) {
          const assignedSessionStudentIds = sessionsResult.data
            .filter(session => session.assigned_to_specialist_id === user.id && !studentIds.includes(session.student_id))
            .map(session => session.student_id);

          if (assignedSessionStudentIds.length > 0) {
            // Fetch students from assigned sessions to check their school
            const { data: assignedStudentsCheck } = await supabase
              .from('students')
              .select('id')
              .in('id', assignedSessionStudentIds)
              .eq('school_site', currentSchool.school_site);

            const validAssignedStudentIds = assignedStudentsCheck?.map(s => s.id) || [];

            // Filter sessions to only include valid assigned sessions
            sessionsResult.data = sessionsResult.data.filter(session =>
              studentIds.includes(session.student_id) || // My students
              (session.assigned_to_specialist_id === user.id && validAssignedStudentIds.includes(session.student_id)) // Assigned sessions from current school only
            );
          }
        }
      } else {
        // For non-specialist users, only fetch their own students' sessions
        sessionsResult = await supabase
          .from('schedule_sessions')
          .select('*')
          .in('student_id', studentIds)
          .eq('provider_id', user.id)
          .is('session_date', null)
          .limit(10000);
      }

      // For specialists, also fetch students from assigned sessions
      let allStudents = studentsResult.data || [];
      if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(profile.role) && sessionsResult.data) {
        // Get student IDs from assigned sessions that aren't already in our student list
        const assignedSessionStudentIds = sessionsResult.data
          .filter(session => session.assigned_to_specialist_id === user.id)
          .map(session => session.student_id)
          .filter(studentId => !studentIds.includes(studentId));

        // Fetch those students if any
        if (assignedSessionStudentIds.length > 0) {
          const { data: assignedStudents } = await supabase
            .from('students')
            .select('*')
            .in('id', assignedSessionStudentIds);

          if (assignedStudents) {
            allStudents = [...allStudents, ...assignedStudents];
          }
        }
      }

      // Fetch SEA profiles if user is Resource Specialist
      let seaProfiles: Array<{ id: string; full_name: string; is_shared?: boolean }> = [];
      let otherSpecialists: Array<{ id: string; full_name: string; role: 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist' }> = [];
      
      if (profile?.role === 'resource') {
        try {
          // RLS policies will automatically filter to the correct school(s)
          // But we also need to filter by the CURRENT school selected in the school switcher
          
          // Get SEAs from the CURRENT school only using RPC function (bypasses RLS)
          console.log('[useScheduleData] Fetching SEAs for current school:', currentSchool.school_id || currentSchool.school_site);
          const { data: schoolSeas, error } = await (supabase.rpc as Function)('get_school_seas', {
            p_school_id: currentSchool.school_id || null,
            p_school_site: currentSchool.school_id ? null : currentSchool.school_site,
            p_school_district: currentSchool.school_id ? null : currentSchool.school_district
          }) as { data: Array<{ id: string; full_name: string; supervising_provider_id: string | null }> | null; error: { message: string; code?: string; details?: string; hint?: string } | null };

          if (error) {
            console.error('[useScheduleData] Error fetching SEA profiles:', error);
          } else if (schoolSeas) {
            seaProfiles = schoolSeas.map(sea => ({
              id: sea.id,
              full_name: sea.full_name,
              is_shared: false  // Deprecated field, kept for compatibility
            }));
            
            console.log(`[useScheduleData] Successfully loaded ${seaProfiles.length} SEAs from current school (${currentSchool.school_id || currentSchool.school_site}): ${seaProfiles.map(s => s.full_name).join(', ')}`);
          }

          // Get other specialists (resource, speech, ot, counseling, specialist) from the CURRENT school only
          console.log('[useScheduleData] Fetching other specialists for current school:', currentSchool.school_id || currentSchool.school_site);

          // Use the database function to get specialists, which handles both primary and secondary schools
          if (currentSchool.school_id) {
            const { data: specialists, error: specialistsError } = await supabase
              .rpc('get_available_specialists', {
                current_user_id: user.id,
                filter_school_id: currentSchool.school_id
              });

            if (specialistsError) {
              console.error('[useScheduleData] Error fetching specialists:', {
                error: specialistsError.message,
                code: specialistsError.code,
                details: specialistsError.details
              });
              otherSpecialists = [];
            } else if (specialists) {
              otherSpecialists = specialists.map(s => ({
                id: s.id,
                full_name: s.full_name,
                role: s.role as 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist'
              }));

              console.log(`[useScheduleData] Successfully loaded ${otherSpecialists.length} other specialists from current school (${currentSchool.school_id}): ${otherSpecialists.map(s => `${s.full_name} (${s.role})`).join(', ')}`);
            }
          } else {
            // Legacy schools without school_id - fallback to old logic
            const { data: specialistsData, error: specialistsError } = await supabase
              .from('profiles')
              .select('id, full_name, role')
              .in('role', ['resource', 'speech', 'ot', 'counseling', 'specialist'])
              .neq('id', user.id)
              .eq('school_site', currentSchool.school_site)
              .eq('school_district', currentSchool.school_district)
              .order('full_name', { ascending: true });

            if (specialistsError) {
              console.error('[useScheduleData] Error fetching other specialists:', specialistsError);
            } else if (specialistsData) {
              // Roles are already filtered by the query, map directly
              otherSpecialists = specialistsData.map(specialist => ({
                id: specialist.id,
                full_name: specialist.full_name ?? '',
                role: specialist.role as 'resource' | 'speech' | 'ot' | 'counseling' | 'specialist'
              }));

              console.log(`[useScheduleData] Successfully loaded ${otherSpecialists.length} other specialists from current school (${currentSchool.school_site}): ${otherSpecialists.map(s => `${s.full_name} (${s.role})`).join(', ')}`);
            }
          }
        } catch (error) {
          console.error('[useScheduleData] Exception fetching SEA profiles or specialists:', error);
        }
      }

      // Separate scheduled and unscheduled sessions
      const allSessions = sessionsResult.data || [];
      const scheduledSessions = allSessions.filter(s => isScheduledSession(s));
      const unscheduledSessions = allSessions.filter(s => !isScheduledSession(s));

      setData({
        students: allStudents,
        sessions: scheduledSessions,
        unscheduledSessions: unscheduledSessions,
        bellSchedules: bellResult.data || [],
        specialActivities: activitiesResult.data || [],
        schoolHours: schoolHoursData,
        seaProfiles,
        otherSpecialists,
        unscheduledCount: unscheduledCountData,
        currentUserId: user.id,
        providerRole: profile.role,
        loading: false,
        error: null,
      });

      console.log('[useScheduleData] Data loaded:', {
        students: allStudents.length,
        scheduledSessions: scheduledSessions.length,
        unscheduledSessions: unscheduledSessions.length,
        totalSessions: allSessions.length,
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
  }, [currentSchool]);

  // Initial data fetch
  useEffect(() => {
    if (currentSchool) {
      fetchData();
    }
  }, [currentSchool, fetchData]);

  // Sync with data manager when initialized
  useEffect(() => {
    if (isDataManagerInitialized && !isDataManagerLoading && data.students.length > 0) {
      const cachedSessions = getExistingSessions();
      // Filter cached sessions to include:
      // 1. Sessions for students in the current school
      // 2. Sessions assigned to the current user (for specialists)
      const studentIds = data.students.map(s => s.id);
      const filteredSessions = cachedSessions.filter(session =>
        (session.student_id && studentIds.includes(session.student_id)) ||
        (data.currentUserId && session.assigned_to_specialist_id === data.currentUserId)
      );

      if (filteredSessions.length > 0) {
        // MERGE sessions instead of replacing - keep any sessions from the initial fetch
        // that might be missing from the data manager cache
        setData(prev => {
          // Create a map of existing session IDs for quick lookup
          const existingSessionIds = new Set(prev.sessions.map(s => s.id));
          // Only add sessions from cache that aren't already present
          const newSessions = filteredSessions.filter(s => !existingSessionIds.has(s.id));
          // If we already have sessions, merge. Otherwise use cache data.
          const mergedSessions = prev.sessions.length > 0
            ? [...prev.sessions, ...newSessions]
            : filteredSessions;

          console.log('[useScheduleData] Synced with data manager:', mergedSessions.length, 'sessions (merged', prev.sessions.length, 'existing +', newSessions.length, 'from cache)');

          return {
            ...prev,
            sessions: mergedSessions as ScheduleSession[],
          };
        });
      }

      if (isCacheStale) {
        refreshSchedulingData().catch(console.error);
      }
    }
  }, [isDataManagerInitialized, isDataManagerLoading, getExistingSessions, isCacheStale, refreshSchedulingData, data.students, data.currentUserId]);

  // Real-time subscription
  useEffect(() => {
    if (!currentSchool || !data.currentUserId) return;

    const supabase = createClient<Database>();
    const channel = supabase.channel('schedule-changes');
    
    // Subscribe to sessions where user is the provider
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'schedule_sessions',
        filter: `provider_id=eq.${data.currentUserId}`,
      },
      (payload) => {
        console.log('[useScheduleData] Real-time update (provider):', payload);
        fetchData();
      }
    );
    
    // For specialist users, also subscribe to sessions assigned to them
    if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(data.providerRole)) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_sessions',
          filter: `assigned_to_specialist_id=eq.${data.currentUserId}`,
        },
        (payload) => {
          console.log('[useScheduleData] Real-time update (specialist assignee):', payload);
          fetchData();
        }
      );
    }
    
    // For SEA users, also subscribe to sessions assigned to them
    if (data.providerRole === 'sea') {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_sessions',
          filter: `assigned_to_sea_id=eq.${data.currentUserId}`,
        },
        (payload) => {
          console.log('[useScheduleData] Real-time update (SEA assignee):', payload);
          fetchData();
        }
      );
    }
    
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSchool, data.currentUserId, data.providerRole, fetchData]);

  // Optimistic update function
  const optimisticUpdateSession = useCallback((sessionId: string, updates: Partial<ScheduleSession>) => {
    setData(prev => {
      // Check if the session is being moved between scheduled and unscheduled
      const isInScheduled = prev.sessions.some(s => s.id === sessionId);
      const isInUnscheduled = prev.unscheduledSessions.some(s => s.id === sessionId);

      // Find the current session object
      const currentSession = isInScheduled
        ? prev.sessions.find(s => s.id === sessionId)
        : prev.unscheduledSessions.find(s => s.id === sessionId);

      if (!currentSession) return prev;

      // Create a temporary session object with updates applied to check scheduling status
      const updatedSession = { ...currentSession, ...updates };
      const willBeScheduled = isScheduledSession(updatedSession);

      if (isInUnscheduled && willBeScheduled) {
        // Moving from unscheduled to scheduled
        const session = prev.unscheduledSessions.find(s => s.id === sessionId);
        if (session) {
          return {
            ...prev,
            sessions: [...prev.sessions, { ...session, ...updates }],
            unscheduledSessions: prev.unscheduledSessions.filter(s => s.id !== sessionId),
          };
        }
      } else if (isInScheduled && !willBeScheduled) {
        // Moving from scheduled to unscheduled
        const session = prev.sessions.find(s => s.id === sessionId);
        if (session) {
          return {
            ...prev,
            sessions: prev.sessions.filter(s => s.id !== sessionId),
            unscheduledSessions: [...prev.unscheduledSessions, { ...session, ...updates }],
          };
        }
      } else if (isInScheduled) {
        // Updating within scheduled sessions
        return {
          ...prev,
          sessions: prev.sessions.map(s =>
            s.id === sessionId ? { ...s, ...updates } : s
          ),
        };
      } else if (isInUnscheduled) {
        // Updating within unscheduled sessions
        return {
          ...prev,
          unscheduledSessions: prev.unscheduledSessions.map(s =>
            s.id === sessionId ? { ...s, ...updates } : s
          ),
        };
      }

      return prev;
    });
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
      const count = await getUnscheduledSessionsCount(currentSchool);
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