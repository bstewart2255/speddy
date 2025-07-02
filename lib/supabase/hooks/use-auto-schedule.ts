import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { OptimizedScheduler } from '../../scheduling/optimized-scheduler';
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

      // Create optimized scheduler instance
      const scheduler = new OptimizedScheduler(user.id, profile.role);

      // Initialize context for the student's school
      await scheduler.initializeContext(student.school_site);

      // Schedule just this one student
      const results = await scheduler.scheduleBatch([student]);

      const result = {
        success: results.totalScheduled === 1,
        scheduledSessions: [],
        unscheduledStudents: results.totalFailed > 0 ? [student] : [],
        errors: results.errors
      };

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

      // Group students by school
      const studentsBySchool = new Map<string, Student[]>();
      students.forEach(student => {
        const school = student.school_site;
        if (!studentsBySchool.has(school)) {
          studentsBySchool.set(school, []);
        }
        studentsBySchool.get(school)!.push(student);
      });

      // Schedule each school separately
      for (const [schoolSite, schoolStudents] of studentsBySchool) {
        console.log(`\n=== Scheduling ${schoolStudents.length} students at ${schoolSite} ===`);

        // Create optimized scheduler instance
        const scheduler = new OptimizedScheduler(user.id, profile.role);

        // Initialize context once for the school
        await scheduler.initializeContext(schoolSite);

        // Schedule all students at this school
        const schoolResults = await scheduler.scheduleBatch(schoolStudents);

        results.totalScheduled += schoolResults.totalScheduled;
        results.totalFailed += schoolResults.totalFailed;
        results.errors.push(...schoolResults.errors);
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