import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { AutoScheduler } from '../../scheduling/auto-scheduler';
import { Database } from '../../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];

export function useAutoSchedule() {
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulingErrors, setSchedulingErrors] = useState<string[]>([]);
  const supabase = createClientComponentClient<Database>();

  const scheduleStudent = async (student: Student) => {
    setIsScheduling(true);
    setSchedulingErrors([]);

    try {
      // Get current user and profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Fetch all necessary data
      const [sessionsData, bellData, activitiesData] = await Promise.all([
        supabase
          .from('schedule_sessions')
          .select('*')
          .eq('provider_id', user.id),
        supabase
          .from('bell_schedules')
          .select('*')
          .eq('provider_id', user.id),
        supabase
          .from('special_activities')
          .select('*')
          .eq('provider_id', user.id)
      ]);

      const existingSessions = sessionsData.data || [];
      const bellSchedules = bellData.data || [];
      const specialActivities = activitiesData.data || [];

      // Create scheduler instance
      const scheduler = new AutoScheduler(user.id, profile.role);

      // Schedule the student
      const result = await scheduler.scheduleStudent(
        student,
        existingSessions,
        bellSchedules,
        specialActivities
      );

      // Save the scheduled sessions to database
      if (result.scheduledSessions.length > 0) {
        const { error: insertError } = await supabase
          .from('schedule_sessions')
          .insert(result.scheduledSessions);

        if (insertError) throw insertError;
      }

      // Set any errors
      if (result.errors.length > 0) {
        setSchedulingErrors(result.errors);
      }

      return result;
    } catch (error) {
      console.error('Auto-scheduling error:', error);
      setSchedulingErrors([error.message]);
      return {
        success: false,
        scheduledSessions: [],
        unscheduledStudents: [student],
        errors: [error.message]
      };
    } finally {
      setIsScheduling(false);
    }
  };

  const scheduleBatchStudents = async (students: Student[]) => {
    setIsScheduling(true);
    setSchedulingErrors([]);

    const results = {
      totalScheduled: 0,
      totalFailed: 0,
      errors: [] as string[]
    };

    try {
      // Get current user and profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Create scheduler instance
      const scheduler = new AutoScheduler(user.id, profile.role);

      // Schedule each student sequentially to avoid conflicts
      for (const student of students) {
        // Fetch fresh data for each student to include previously scheduled sessions
        const [sessionsData, bellData, activitiesData] = await Promise.all([
          supabase
            .from('schedule_sessions')
            .select('*')
            .eq('provider_id', user.id),
          supabase
            .from('bell_schedules')
            .select('*')
            .eq('provider_id', user.id),
          supabase
            .from('special_activities')
            .select('*')
            .eq('provider_id', user.id)
        ]);

        const result = await scheduler.scheduleStudent(
          student,
          sessionsData.data || [],
          bellData.data || [],
          activitiesData.data || []
        );

        // Save scheduled sessions
        if (result.scheduledSessions.length > 0) {
          const { error: insertError } = await supabase
            .from('schedule_sessions')
            .insert(result.scheduledSessions);

          if (!insertError) {
            results.totalScheduled++;
          } else {
            results.totalFailed++;
            results.errors.push(`Failed to save sessions for ${student.initials}: ${insertError.message}`);
          }
        } else {
          results.totalFailed++;
        }

        // Collect errors
        results.errors.push(...result.errors);
      }

      setSchedulingErrors(results.errors);
      return results;
    } catch (error) {
      console.error('Batch scheduling error:', error);
      setSchedulingErrors([error.message]);
      return {
        totalScheduled: 0,
        totalFailed: students.length,
        errors: [error.message]
      };
    } finally {
      setIsScheduling(false);
    }
  };

  return {
    scheduleStudent,
    scheduleBatchStudents,
    isScheduling,
    schedulingErrors
  };
}