import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OptimizedScheduler } from '../../scheduling/optimized-scheduler';
import { SchedulingDataManager } from '../../scheduling/scheduling-data-manager';
import type { Database } from '../../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];

export function useAutoSchedule(debug: boolean = false) {
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulingErrors, setSchedulingErrors] = useState<string[]>([]);
  const supabase = createClient<Database>();

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
      const scheduler = new OptimizedScheduler(user.id, profile.role, debug);

      // Initialize context for the student's school
      if (!student.school_site) {
        throw new Error('Student school site is required but not set');
      }
      await scheduler.initializeContext(student.school_site, student.school_district || '');

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
      if (debug) console.error('Auto-scheduling error:', error);
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
      errors: [] as string[],
      lastSchool: null as string | null
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
        if (!school) {
          throw new Error(`Student ${student.initials || student.id} has no school site assigned`);
        }
        if (!studentsBySchool.has(school)) {
          studentsBySchool.set(school, []);
        }
        studentsBySchool.get(school)!.push(student);
      });

      // Get data manager instance
      const dataManager = SchedulingDataManager.getInstance();
      
      // Schedule each school separately
      for (const [schoolSite, schoolStudents] of studentsBySchool) {
        if (debug) {
          console.log(`\n=== Scheduling ${schoolStudents.length} students at ${schoolSite} ===`);
        }

        // Ensure data manager is initialized for this school
        // Get school_district from the first student in this school group
        const schoolDistrict = schoolStudents[0]?.school_district || '';
        if (!dataManager.isInitialized() || schoolSite !== results.lastSchool) {
          await dataManager.initialize(user.id, schoolSite, schoolDistrict);
          results.lastSchool = schoolSite;
        } else if (dataManager.isCacheStale()) {
          await dataManager.refresh();
        }

        // Create optimized scheduler instance (uses refactored version by default)
        const scheduler = new OptimizedScheduler(user.id, profile.role, debug);

        // Initialize context once for the school
        await scheduler.initializeContext(schoolSite, schoolDistrict);

        // Schedule all students at this school
        const schoolResults = await scheduler.scheduleBatch(schoolStudents);

        results.totalScheduled += schoolResults.totalScheduled;
        results.totalFailed += schoolResults.totalFailed;
        results.errors.push(...schoolResults.errors);
      }

      setSchedulingErrors(results.errors);
      return results;
    } catch (error) {
      if (debug) console.error('Batch scheduling error:', error);
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