/* eslint-disable no-console -- every console call left here sits behind the `debug` flag */
// Kept through SPE-97: that sweep removed UNGATED debug logging, which is
// what polluted production. Opt-in output behind a flag was never the
// problem, and deleting it would leave the surrounding block computing a
// payload it then discards.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OptimizedScheduler, MissingWorkdaysError, EnhancedSchedulingResult } from '../../scheduling/optimized-scheduler';
import { SchedulingDataManager } from '../../scheduling/scheduling-data-manager';
import {
  DEFAULT_SCHEDULING_STRATEGY,
  type SchedulingStrategy,
} from '../../scheduling/scheduling-strategy';
import type { Database } from '../../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];

export interface ScheduleBatchOptions {
  /** Placement strategy for this run (SPE-473). Defaults to 'balanced'. */
  strategy?: SchedulingStrategy;
  /**
   * Every student at the schools being scheduled, including ones already fully
   * scheduled. Lets grouping recognise the peers already on the calendar
   * instead of only seeing the students in this run. Defaults to `students`.
   */
  roster?: Student[];
}

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
        .select('role, works_at_multiple_schools')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Create optimized scheduler instance
      const scheduler = new OptimizedScheduler(user.id, profile.role, debug, !!profile.works_at_multiple_schools);

      // Initialize context for the student's school
      if (!student.school_site) {
        throw new Error('Student school site is required but not set');
      }
      // SPE-463: pass school_id so bell schedules and special activities are
      // found by school_id rather than the school_site text, which is NULL on
      // every row written since the school_id migration.
      await scheduler.initializeContext(
        student.school_site,
        student.school_district || '',
        student.school_id || undefined
      );

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSchedulingErrors([errorMessage]);
      return {
        success: false,
        scheduledSessions: [],
        unscheduledStudents: [student],
        errors: [errorMessage]
      };
    } finally {
      setIsScheduling(false);
    }
  };
  const scheduleBatchStudents = async (
    students: Student[],
    options: ScheduleBatchOptions = {}
  ): Promise<EnhancedSchedulingResult> => {
    const strategy = options.strategy ?? DEFAULT_SCHEDULING_STRATEGY;
    setIsScheduling(true);
    setSchedulingErrors([]);

    const results: EnhancedSchedulingResult = {
      totalScheduled: 0,
      totalFailed: 0,
      errors: [] as string[],
      unplacedStudents: [] as Student[],
      canManuallyPlace: false,
      availableSlots: undefined
    };

    let lastSchool: string | null = null;

    try {
      // Get current user and profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, works_at_multiple_schools')
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

      // Group the roster the same way, so each school's run can see the students
      // already scheduled there. Roster entries with no school site are skipped
      // rather than fatal — unlike the batch above, a student we merely can't
      // group against costs nothing.
      const rosterBySchool = new Map<string, Student[]>();
      (options.roster ?? students).forEach(student => {
        const school = student.school_site;
        if (!school) return;
        if (!rosterBySchool.has(school)) {
          rosterBySchool.set(school, []);
        }
        rosterBySchool.get(school)!.push(student);
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
        // SPE-463: take the school_id from the first student that has one
        // rather than from [0] — school_id is nullable, and a single
        // unmigrated student at the head of the group would otherwise drop the
        // whole school back to school_site-only matching.
        const schoolId = schoolStudents.find(s => s.school_id)?.school_id || undefined;
        if (!dataManager.isInitialized() || schoolSite !== lastSchool) {
          await dataManager.initialize(user.id, schoolSite, schoolDistrict, schoolId, profile.role);
          lastSchool = schoolSite;
        } else if (dataManager.isCacheStale()) {
          await dataManager.refresh();
        }

        // Create optimized scheduler instance (uses refactored version by default)
        const scheduler = new OptimizedScheduler(
          user.id,
          profile.role,
          debug,
          !!profile.works_at_multiple_schools,
          strategy
        );

        try {
          // Initialize context once for the school (SPE-463: school_id included)
          await scheduler.initializeContext(schoolSite, schoolDistrict, schoolId);

          // Schedule all students at this school
          const schoolResults = await scheduler.scheduleBatch(
            schoolStudents,
            rosterBySchool.get(schoolSite)
          );

          results.totalScheduled += schoolResults.totalScheduled;
          results.totalFailed += schoolResults.totalFailed;
          results.errors.push(...schoolResults.errors);
          results.unplacedStudents.push(...(schoolResults.unplacedStudents || []));
          results.canManuallyPlace = results.canManuallyPlace || schoolResults.canManuallyPlace;
          if (schoolResults.availableSlots) {
            results.availableSlots = schoolResults.availableSlots;
          }
        } catch (error) {
          // A school with no work days recorded is skipped, not fatal (SPE-367):
          // the provider's other schools still schedule, and they get one clear
          // message naming the school to fix.
          if (!(error instanceof MissingWorkdaysError)) throw error;

          results.totalFailed += schoolStudents.length;
          results.errors.push(error.message);
          results.unplacedStudents.push(...schoolStudents);
          results.schoolsMissingWorkdays = [
            ...(results.schoolsMissingWorkdays || []),
            error.schoolSite,
          ];
          results.workdayBlockedCount =
            (results.workdayBlockedCount || 0) + schoolStudents.length;
        }
      }

      setSchedulingErrors(results.errors);
      return results;
    } catch (error) {
      if (debug) console.error('Batch scheduling error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSchedulingErrors([errorMessage]);
      return {
        totalScheduled: 0,
        totalFailed: students.length,
        errors: [errorMessage],
        unplacedStudents: students,
        canManuallyPlace: false
      };
    } finally {
      setIsScheduling(false);
    }
  };

  const placeSessionsManually = async (students: Student[]) => {
    setIsScheduling(true);
    setSchedulingErrors([]);

    try {
      // Get current user and profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, works_at_multiple_schools')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Group students by school for manual placement
      const studentsBySchool = new Map<string, Student[]>();
      students.forEach(student => {
        const school = student.school_site;
        if (school) {
          if (!studentsBySchool.has(school)) {
            studentsBySchool.set(school, []);
          }
          studentsBySchool.get(school)!.push(student);
        }
      });

      const allPlacedSessions: any[] = [];
      const allFailedStudents: Student[] = [];
      const allErrors: string[] = [];

      // Place sessions for each school
      for (const [schoolSite, schoolStudents] of studentsBySchool) {
        const schoolDistrict = schoolStudents[0]?.school_district || '';
        // SPE-463: see the note on the auto-schedule path above.
        const schoolId = schoolStudents.find(s => s.school_id)?.school_id || undefined;

        // Create scheduler and initialize context
        const scheduler = new OptimizedScheduler(user.id, profile.role, debug, !!profile.works_at_multiple_schools);

        try {
          await scheduler.initializeContext(schoolSite, schoolDistrict, schoolId);

          // Try manual placement with conflict tolerance
          const result = await scheduler.tryManualPlacement(schoolStudents, true);

          allPlacedSessions.push(...result.placedSessions);
          allFailedStudents.push(...result.failedStudents);
          allErrors.push(...result.errors);
        } catch (error) {
          // Same treatment as the auto path (SPE-367): skip this school, keep
          // the others, and surface the actionable message.
          if (!(error instanceof MissingWorkdaysError)) throw error;

          allFailedStudents.push(...schoolStudents);
          allErrors.push(error.message);
        }
      }

      return {
        success: allPlacedSessions.length > 0,
        placedSessions: allPlacedSessions,
        failedStudents: allFailedStudents,
        errors: allErrors
      };
    } catch (error) {
      if (debug) console.error('Manual placement error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSchedulingErrors([errorMessage]);
      return {
        success: false,
        placedSessions: [],
        failedStudents: students,
        errors: [errorMessage]
      };
    } finally {
      setIsScheduling(false);
    }
  };

  return {
    scheduleStudent,
    scheduleBatchStudents,
    placeSessionsManually,
    isScheduling,
    schedulingErrors
  };
}