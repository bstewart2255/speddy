import { createClient } from '@/lib/supabase/client';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';
import { Database } from "../../src/types/database";
import { SchedulingDataManager } from './scheduling-data-manager';
import { ManualPlacementService } from '../services/manual-placement-service';
import { filterScheduledSessions, type ScheduledSession } from '../utils/session-helpers';
import { findOverlappingOtherProviderSession, type OtherProviderSessionLite } from '../services/session-update-service';
import { DEFAULT_SCHEDULING_CONFIG } from './scheduling-config';
import {
  DEFAULT_SCHEDULING_STRATEGY,
  getGroupingKey,
  isGroupingStrategy,
  type SchedulingStrategy,
} from './scheduling-strategy';
import type {
  Student,
  ScheduleSession,
  BellSchedule,
  SpecialActivity
} from './types/scheduling-data';

/**
 * Thrown when a multi-school provider has no workdays recorded for the school
 * being scheduled (SPE-275 / SPE-367). Typed so callers can present the
 * actionable "set your work schedule" message instead of a generic failure,
 * and so a batch across several schools can skip just this one.
 */
export class MissingWorkdaysError extends Error {
  readonly schoolSite: string;

  constructor(schoolSite: string) {
    super(
      `No work days are set for ${schoolSite}. ` +
      `Because you work at more than one school, Speddy needs to know which days ` +
      `you're at ${schoolSite} before it can schedule sessions there — otherwise it ` +
      `could place sessions on days you're at another school. ` +
      `Set them under Settings → Work Schedule, then try again.`
    );
    this.name = 'MissingWorkdaysError';
    this.schoolSite = schoolSite;
  }
}

interface TimeSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  available: boolean;
  capacity: number;
  conflicts: string[];
}

interface StudentSchedule {
  studentId: string;
  sessions: Array<{
    day: number;
    startTime: string;
    endTime: string;
  }>;
}

interface SchedulingContext {
  schoolSite: string;
  workDays: number[];
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  existingSessions: ScheduledSession[]; // Only scheduled sessions (with non-null day/time fields)
  validSlots: Map<string, TimeSlot>;
  schoolHours: Array<{  // Add this
    day_of_week: number;
    grade_level: string;
    start_time: string;
    end_time: string;
  }>;
  studentGradeMap: Map<string, string>; // Map student ID to grade level
  /**
   * Map student ID to the grouping key of the active strategy (SPE-473), for
   * every student known at this school — not just the ones in the current run.
   * Empty for strategies that don't group.
   */
  studentGroupKeyMap: Map<string, string>;

  // SPE-287: cross-provider template sessions per owned student (studentId -> the other
  // provider's sessions for the SAME shared child). Used to hard-avoid double-booking a
  // shared student across providers. Only shared students have entries.
  crossProviderSessionsByStudent: Map<string, OtherProviderSessionLite[]>;

  // Enhanced caching structures for O(1) lookups
  providerAvailability: Map<string, Map<number, AvailabilitySlot[]>>; // provider -> day -> slots
  bellSchedulesByGrade: Map<string, Map<number, BellSchedule[]>>; // grade -> day -> schedules
  specialActivitiesByTeacher: Map<string, Map<number, SpecialActivity[]>>; // teacher -> day -> activities
  
  // Cache metadata
  cacheMetadata: {
    lastFetched: Date;
    isStale: boolean;
    fetchErrors: string[];
    queryCount: number;
  };
}

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  schoolSite: string;
}

interface SchedulingResult {
  success: boolean;
  scheduledSessions: Omit<
    ScheduleSession,
    "id" | "created_at" | "updated_at"
  >[];
  unscheduledStudents: Student[];
  errors: string[];
}

export interface EnhancedSchedulingResult {
  totalScheduled: number;
  totalFailed: number;
  errors: string[];
  unplacedStudents: Student[];
  canManuallyPlace: boolean;
  availableSlots?: TimeSlot[];
  /**
   * Schools skipped because the provider has no work days recorded there
   * (SPE-367). Reported separately from `errors` because the caller's
   * manual-placement branch swallows `errors` entirely — and this one is
   * always worth showing, since it is the user's to fix and nothing at that
   * school can be scheduled until they do.
   */
  schoolsMissingWorkdays?: string[];
  /**
   * How many students sit at those schools. Lets a caller tell "missing work
   * days is the whole story" from "one school was blocked AND another failed
   * for real reasons" — the second still deserves the normal failure handling.
   */
  workdayBlockedCount?: number;
}

/**
 * True when every failure in a run is explained by a school with no work days
 * recorded (SPE-367). The caller uses this to suppress its generic "couldn't
 * place all sessions due to conflicts — adjust your bell schedules" message,
 * which would contradict the real cause and send the provider somewhere useless.
 *
 * Deliberately does NOT require `totalScheduled === 0`: in a batch spanning
 * several schools, one school can schedule fine while another is blocked, and
 * that run still has no conflict to report. It DOES require every failure to be
 * accounted for — if another school failed for real scheduling reasons, that
 * deserves the normal handling, including the manual-placement offer.
 */
export function isBlockedOnlyByMissingWorkdays(result: EnhancedSchedulingResult): boolean {
  return (
    !!result.schoolsMissingWorkdays?.length &&
    result.totalFailed > 0 &&
    result.workdayBlockedCount === result.totalFailed
  );
}

export class OptimizedScheduler {
  private supabase = createClient();
  private context: SchedulingContext | null = null;
  private dataManager: SchedulingDataManager;
  private manualPlacementService: ManualPlacementService | null = null;
  private debug: boolean;
  private performanceMetrics = {
    totalQueries: 0,
    batchQueries: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  constructor(
    private providerId: string,
    private providerRole: string,
    debug: boolean = false,
    /**
     * SPE-275: only an itinerant provider's empty workday list is ambiguous.
     * A single-school provider legitimately has no `user_site_schedules` rows,
     * and "all weekdays" is the right answer for them — so the fail-closed
     * guard in `initializeContext` is gated on this. Defaults to false, which
     * preserves the previous behaviour for any caller that doesn't pass it.
     */
    private worksAtMultipleSchools: boolean = false,
    /**
     * SPE-473: which placement strategy this run uses. Defaults to the previous
     * fixed behaviour, so callers that don't pass one are unaffected.
     */
    private strategy: SchedulingStrategy = DEFAULT_SCHEDULING_STRATEGY
  ) {
    // Get or create the singleton data manager instance
    this.dataManager = SchedulingDataManager.getInstance();
    this.debug = debug;
    this.manualPlacementService = new ManualPlacementService(this.supabase, this.dataManager);
  }

  /**
   * Conditional logging helper
   */
  private log(...args: any[]): void {
    if (this.debug) {
      console.log(...args);
    }
  }

  /**
   * Get data from the data manager instead of direct queries
   */
  private async getDataFromManager(schoolSite: string) {
    this.log('[PERFORMANCE] Getting data from DataManager...');
    const startTime = Date.now();
    
    // Get work days from data manager
    const workDays = this.dataManager.getProviderWorkDays(schoolSite);

    // Get all existing sessions (filter to only scheduled sessions with non-null day/time fields)
    //
    // SPE-474: also drop dated instances and soft-deleted rows. The data manager
    // fetches `select('*')` with no such filter, and an instance carries
    // day_of_week/start_time/end_time exactly like its template, so the weekly
    // grid was seeing up to twelve weeks of copies of every session. Two things
    // broke on that:
    //
    //   - `scheduleStudent` derives `sessionsNeeded` as
    //     `sessions_per_week - existingSessionsForStudent`, which went to 0 for
    //     anyone with instances. It then placed nothing and reported success,
    //     because `scheduledSessions.length === sessionsNeeded` held at 0 === 0.
    //   - `buildValidSlotsMap` subtracts overlapping sessions from a capacity of
    //     8, so one weekly session backed by twelve instances drove the slot
    //     negative and removed it from the grid entirely — a calendar with a
    //     handful of sessions could present as having no room at all.
    //
    // Scoped to the scheduler's own context on purpose: the shared data manager
    // still serves unfiltered rows to the calendar and conflict paths, which
    // legitimately work in dated instances.
    const existingSessions = filterScheduledSessions(this.dataManager.getExistingSessions())
      .filter(session => session.is_template === true && session.deleted_at == null);

    // SPE-287: cross-provider sessions for shared students (loaded once by the DataManager).
    // Snapshot per run (mirrors the existingSessions copy) so a concurrent DataManager
    // refresh — which clears then repopulates the shared singleton map — cannot empty it
    // mid-run and cause a missed hard-avoid.
    const crossProviderSessionsByStudent = new Map(this.dataManager.getCrossProviderSessions());
    
    // Get bell schedules for all grades
    const bellSchedules: BellSchedule[] = [];
    const grades = ['K', 'TK', '1', '2', '3', '4', '5'];
    for (const grade of grades) {
      for (const day of [1, 2, 3, 4, 5]) {
        const conflicts = this.dataManager.getBellScheduleConflicts(grade, day, '00:00', '23:59');
        bellSchedules.push(...conflicts);
      }
    }
    
    // Get special activities (we'll need to query all teachers)
    const specialActivities: SpecialActivity[] = [];
    // For now, we'll leave this empty as we'd need to know all teacher names
    
    // Get school hours from existing context or use defaults
    const schoolHours: Array<{ day_of_week: number; grade_level: string; start_time: string; end_time: string }> = [];
    
    const elapsed = Date.now() - startTime;
    this.log(`[PERFORMANCE] DataManager data retrieval completed in ${elapsed}ms`);
    
    // Update metrics from data manager
    const dmMetrics = this.dataManager.getMetrics();
    this.performanceMetrics.cacheHits += dmMetrics.cacheHits;
    this.performanceMetrics.cacheMisses += dmMetrics.cacheMisses;
    
    return {
      workSchedule: workDays.map(day => ({ day_of_week: day })),
      bellSchedules,
      specialActivities,
      existingSessions,
      schoolHours,
      crossProviderSessionsByStudent
    };
  }

  /**
   * Validate that cache is populated and not stale
   */
  private validateCacheReady(): boolean {
    if (!this.context) {
      if (this.debug) console.error('[ERROR] Context not initialized');
      return false;
    }
    
    if (this.context.cacheMetadata.fetchErrors.length > 0) {
      if (this.debug) console.warn('[WARNING] Cache has fetch errors:', this.context.cacheMetadata.fetchErrors);
    }
    
    const cacheAge = Date.now() - this.context.cacheMetadata.lastFetched.getTime();
    const maxCacheAge = 15 * 60 * 1000; // 15 minutes
    
    if (cacheAge > maxCacheAge) {
      if (this.debug) console.warn(`[WARNING] Cache is ${Math.round(cacheAge / 1000 / 60)} minutes old`);
      this.context.cacheMetadata.isStale = true;
    }
    
    return true;
  }
  

  /**
   * Pre-compute all valid time slots for the school
   * This runs ONCE per scheduling session, not per student
   */
  async initializeContext(
    schoolSite: string,
    schoolDistrict?: string,
    schoolId?: string
  ): Promise<SchedulingContext> {
    this.log(`Initializing scheduling context for ${schoolSite}...`);
    this.log('[PERFORMANCE] Query count before initialization:', this.performanceMetrics.totalQueries);

    // Initialize the data manager if not already initialized for this school
    // This ensures we reload data when switching between schools
    //
    // SPE-463: schoolId used to be hardcoded `undefined` here, which left the
    // data manager filtering bell schedules and special activities by
    // `school_site`. Those columns are NULL on every row written since the
    // school_id migration, so the auto-scheduler loaded ZERO blocks at Bancroft,
    // Mt. Diablo and Rodeo Hills and would happily place a session through a
    // grade's lunch. The interactive drag path already passed school_id
    // (use-scheduling-data.ts) and was unaffected.
    if (!this.dataManager.isInitializedForSchool(schoolSite, schoolDistrict, schoolId)) {
      // Use empty string as fallback for backward compatibility.
      //
      // providerRole matters: the data manager gates the specialist branch of
      // fetchExistingSessions on it, so initializing without a role hides
      // sessions assigned to this user on other providers' students — and the
      // manager is a singleton shared with the schedule page, so omitting it
      // here also wiped the role that page had set.
      await this.dataManager.initialize(
        this.providerId,
        schoolSite,
        schoolDistrict || '',
        schoolId,
        this.providerRole,
      );
    }

    // Use data manager instead of direct queries
    const preloadedData = await this.getDataFromManager(schoolSite);
    
    // Extract work days from preloaded data
    const workDays = preloadedData.workSchedule?.map((s: any) => s.day_of_week) || [];
    
    // SPE-275: this used to fail OPEN — an empty workday list silently became
    // all five weekdays, so an itinerant provider got sessions placed on days
    // they are not at the school (observed in prod 2026-07-17: a Monday 8:00 AM
    // session at a Thursday/Friday-only site).
    //
    // The two empty cases are not the same:
    //   - single-school provider: no `user_site_schedules` rows is normal, and
    //     all weekdays is the correct answer. Keep the default.
    //   - multi-school provider: an empty list means we genuinely do not know
    //     which days they are on site. Refuse rather than invent availability,
    //     and tell the caller what to fix (SPE-367).
    if (workDays.length === 0) {
      if (this.worksAtMultipleSchools) {
        throw new MissingWorkdaysError(schoolSite);
      }
      workDays.push(1, 2, 3, 4, 5);
    }
    
    this.log(`Work days at ${schoolSite}: ${workDays.join(", ")}`);

    // Build enhanced caching structures for O(1) lookups
    const providerAvailability = new Map<string, Map<number, AvailabilitySlot[]>>();
    const bellSchedulesByGrade = new Map<string, Map<number, BellSchedule[]>>();
    const specialActivitiesByTeacher = new Map<string, Map<number, SpecialActivity[]>>();
    
    // Index bell schedules by grade for O(1) lookup
    for (const bell of preloadedData.bellSchedules) {
      const grades = bell.grade_level.split(',').map((g: string) => g.trim());
      for (const grade of grades) {
        if (!bellSchedulesByGrade.has(grade)) {
          bellSchedulesByGrade.set(grade, new Map());
        }
        const gradeMap = bellSchedulesByGrade.get(grade)!;
        if (!gradeMap.has(bell.day_of_week)) {
          gradeMap.set(bell.day_of_week, []);
        }
        gradeMap.get(bell.day_of_week)!.push(bell);
      }
    }
    
    // Index special activities by teacher for O(1) lookup
    for (const activity of preloadedData.specialActivities) {
      if (!specialActivitiesByTeacher.has(activity.teacher_name)) {
        specialActivitiesByTeacher.set(activity.teacher_name, new Map());
      }
      const teacherMap = specialActivitiesByTeacher.get(activity.teacher_name)!;
      if (!teacherMap.has(activity.day_of_week)) {
        teacherMap.set(activity.day_of_week, []);
      }
      teacherMap.get(activity.day_of_week)!.push(activity);
    }
    
    // Build provider availability map for all weekdays
    const providerKey = `${this.providerId}-${schoolSite}`;
    providerAvailability.set(providerKey, new Map());
    for (const day of [1, 2, 3, 4, 5]) {
      const slots: AvailabilitySlot[] = [{
        dayOfWeek: day,
        startTime: '08:00',
        endTime: '15:00',
        schoolSite
      }];
      providerAvailability.get(providerKey)!.set(day, slots);
    }
    
    const context: SchedulingContext = {
      schoolSite,
      workDays,
      bellSchedules: preloadedData.bellSchedules || [],
      specialActivities: preloadedData.specialActivities || [],
      existingSessions: filterScheduledSessions(preloadedData.existingSessions || []),
      validSlots: new Map(),
      schoolHours: preloadedData.schoolHours || [],
      studentGradeMap: new Map(),
      studentGroupKeyMap: new Map(),
      crossProviderSessionsByStudent: preloadedData.crossProviderSessionsByStudent || new Map(),

      // Enhanced caching structures
      providerAvailability,
      bellSchedulesByGrade,
      specialActivitiesByTeacher,
      
      // Cache metadata
      cacheMetadata: {
        lastFetched: new Date(),
        isStale: false,
        fetchErrors: [],
        queryCount: this.performanceMetrics.totalQueries
      }
    };

    // 3. Pre-compute all valid time slots
    this.buildValidSlotsMap(context);

    this.context = context;
    
    this.log('[PERFORMANCE] Context initialization complete');
    this.log(`[PERFORMANCE] Total queries so far: ${this.performanceMetrics.totalQueries}`);
    this.log(`[PERFORMANCE] Batch queries: ${this.performanceMetrics.batchQueries}`);
    this.log(`[PERFORMANCE] Bell schedules indexed: ${bellSchedulesByGrade.size} grades`);
    this.log(`[PERFORMANCE] Special activities indexed: ${specialActivitiesByTeacher.size} teachers`);
    
    return context;
  }

  /**
   * Build a map of all possible time slots and their availability
   */
  private buildValidSlotsMap(context: SchedulingContext) {
    this.log("Building valid slots map...");

    const timeSlots = this.generateTimeSlots(8, 14); // Default hours for slot generation
    let totalSlots = 0;
    let validSlots = 0;

    // Check all weekdays (Monday=1 through Friday=5)
    for (const day of [1, 2, 3, 4, 5]) {
      for (const startTime of timeSlots) {
        totalSlots++;
        const slot: TimeSlot = {
          dayOfWeek: day,
          startTime,
          endTime: "", // Will be set based on session duration
          available: true,
          capacity: 8, // Updated to 8 as per new rules
          conflicts: [],
        };

        // Check existing sessions to determine current capacity
        const overlappingSessions = context.existingSessions.filter(
          (session) =>
            session.day_of_week === day &&
            this.timesOverlap(startTime, session.start_time, session.end_time),
        );

        slot.capacity -= overlappingSessions.length;

        if (slot.capacity > 0) {
          validSlots++;
          context.validSlots.set(`${day}-${startTime}`, slot);
        }
      }
    }

    this.log(
      `Valid slots: ${validSlots}/${totalSlots} (${Math.round((validSlots / totalSlots) * 100)}% available)`,
    );
  }

  /**
   * Get school hours for a specific grade and day
   */
  private getSchoolHoursForGrade(day: number, grade: string, sessionTime?: string): { start: string; end: string } {
    if (!this.context) {
      return { start: '08:00', end: '15:00' };
    }

    // For K and TK, check if there are AM/PM specific schedules
    if ((grade === 'K' || grade === 'TK') && sessionTime) {
      const sessionHour = parseInt(sessionTime.split(':')[0]);
      const isAM = sessionHour < 12;

      // Try to find AM/PM specific schedule first
      const amPmGrade = `${grade}-${isAM ? 'AM' : 'PM'}`;
      const amPmHours = this.context.schoolHours.find(h => 
        h.day_of_week === day && h.grade_level === amPmGrade
      );

      if (amPmHours) {
        return {
          start: amPmHours.start_time.substring(0, 5),
          end: amPmHours.end_time.substring(0, 5)
        };
      }
    }

    // Fall back to regular grade hours
    const hours = this.context.schoolHours.find(h => 
      h.day_of_week === day && 
      (h.grade_level === grade || (h.grade_level === 'default' && !['TK', 'K'].includes(grade)))
    );

    if (!hours) {
      return { start: '08:00', end: '15:00' }; // Default fallback
    }

    return {
      start: hours.start_time.substring(0, 5),
      end: hours.end_time.substring(0, 5)
    };
  }

  /**
   * Schedule multiple students efficiently
   */
  async scheduleBatch(
    students: Student[],
    /**
     * SPE-473: every student at this school, including ones already fully
     * scheduled. Grouping and the grade tiebreak read this to recognise the
     * peers already sitting in a slot — without it they can only see students
     * in the current run, so adding one new 3rd grader would never join the
     * existing 3rd grade group. Optional; defaults to the batch itself, which
     * is the previous behaviour.
     */
    roster?: Student[]
  ): Promise<EnhancedSchedulingResult> {
    if (!this.context) {
      throw new Error("Context not initialized. Call initializeContext first.");
    }
    
    // Validate cache is not stale
    if (this.context.cacheMetadata.isStale) {
      if (this.debug) console.warn('[WARNING] Cache is marked as stale. Consider reinitializing context.');
    }
    
    // Log performance metrics at start
    this.log('[PERFORMANCE] Starting batch scheduling');
    this.log(`[PERFORMANCE] Initial query count: ${this.performanceMetrics.totalQueries}`);
    const batchStartTime = Date.now();

    this.log(
      `\nScheduling ${students.length} students at ${this.context.schoolSite}`,
    );
    this.log(`Available days: ${this.context.workDays.join(", ")}`);

    const results: EnhancedSchedulingResult = {
      totalScheduled: 0,
      totalFailed: 0,
      errors: [] as string[],
      unplacedStudents: [] as Student[],
      canManuallyPlace: false
    };

    // Filter out students without scheduling configuration (e.g., from bulk import)
    const studentsWithoutConfig = students.filter(s => !s.sessions_per_week || !s.minutes_per_session);
    const studentsToSchedule = students.filter(s => s.sessions_per_week && s.minutes_per_session);

    if (studentsWithoutConfig.length > 0) {
      studentsWithoutConfig.forEach(student => {
        results.unplacedStudents.push(student);
        results.errors.push(`Student ${student.initials} does not have scheduling configured (sessions/week and minutes/session required)`);
        results.totalFailed++;
      });
      this.log(`Skipped ${studentsWithoutConfig.length} students without scheduling configuration: ${studentsWithoutConfig.map(s => s.initials).join(', ')}`);
    }

    // Early return if no students to schedule
    if (studentsToSchedule.length === 0) {
      this.log('No students to schedule (all missing configuration)');
      return results;
    }

    // Populate student grade map for grade grouping optimization.
    //
    // Deliberately seeded from the batch only, as it always has been. This map
    // feeds the balanced ordering's same-grade tiebreak; widening it to the
    // roster would make that tiebreak start firing against already-scheduled
    // students and quietly change where a default run places people. That is
    // arguably a fix, but it is not this change's to make.
    studentsToSchedule.forEach(student => {
      this.context!.studentGradeMap.set(student.id, student.grade_level.trim());
    });

    // Grouping keys, by contrast, cover every student known at this school
    // (SPE-473). Without the roster a grouping run can only see the students in
    // this batch, so adding one new 3rd grader would never join the 3rd grade
    // group already on the calendar. Non-grouping strategies produce no keys, so
    // this map stays empty for them and cannot affect their placements.
    [...(roster ?? []), ...studentsToSchedule].forEach(student => {
      const groupKey = getGroupingKey(student, this.strategy);
      if (groupKey) {
        this.context!.studentGroupKeyMap.set(student.id, groupKey);
      }
    });

    const sortedStudents = this.sortStudentsForStrategy(studentsToSchedule);

    this.log(`Strategy: ${this.strategy}`);
    this.log('Student scheduling order:');
    sortedStudents.forEach(s => {
      const sessions = s.sessions_per_week || 0;
      const minutes = s.minutes_per_session || 0;
      const totalMinutes = sessions * minutes;
      this.log(`  ${s.initials}: ${sessions} sessions × ${minutes}min = ${totalMinutes} total minutes`);
    });

    // CRITICAL: Fetch all unscheduled sessions for these students BEFORE scheduling
    // This ensures we UPDATE existing sessions instead of creating duplicates
    const studentIds = sortedStudents.map(s => s.id);
    this.log(`Fetching unscheduled sessions for ${studentIds.length} students...`);

    const { data: unscheduledSessions, error: fetchError } = await this.supabase
      .from('schedule_sessions')
      .select('id, student_id, delivered_by, assigned_to_sea_id, assigned_to_specialist_id, service_type')
      .in('student_id', studentIds)
      .is('day_of_week', null)
      .is('start_time', null)
      .is('end_time', null)
      .order('created_at', { ascending: true }); // Oldest first

    this.performanceMetrics.totalQueries++;

    if (fetchError) {
      this.log(`Error fetching unscheduled sessions: ${fetchError.message}`);
      results.errors.push(`Failed to fetch unscheduled sessions: ${fetchError.message}`);
      return results;
    }

    // Create a map of student_id -> array of unscheduled session objects
    const unscheduledSessionsByStudent = new Map<string, Array<{
      id: string;
      student_id: string;
      delivered_by: string | null;
      assigned_to_sea_id: string | null;
      assigned_to_specialist_id: string | null;
      service_type: string | null;
    }>>();
    (unscheduledSessions || []).forEach(session => {
      if (!unscheduledSessionsByStudent.has(session.student_id)) {
        unscheduledSessionsByStudent.set(session.student_id, []);
      }
      unscheduledSessionsByStudent.get(session.student_id)!.push(session);
    });

    this.log(`Found ${unscheduledSessions?.length || 0} unscheduled sessions to update`);

    const allScheduledSessions: Omit<
      ScheduleSession,
      "id" | "created_at" | "updated_at"
    >[] = [];

    // Track sessions to UPDATE (with IDs) vs INSERT (without IDs)
    const sessionsToUpdate: Array<{ id: string; updates: any }> = [];
    const sessionsToInsert: Omit<ScheduleSession, "id" | "created_at" | "updated_at">[] = [];

    for (const student of sortedStudents) {
      this.log(
        `\nScheduling ${student.initials}: ${student.sessions_per_week} sessions x ${student.minutes_per_session}min`,
      );

      const result = this.scheduleStudent(student);

      // Get unscheduled session objects for this student
      const unscheduledSessions = unscheduledSessionsByStudent.get(student.id) || [];

      // Process ANY scheduled sessions found (even partial success)
      if (result.scheduledSessions.length > 0) {
        // Match scheduled sessions with existing unscheduled sessions
        result.scheduledSessions.forEach((scheduledSession, index) => {
          if (index < unscheduledSessions.length) {
            // Update existing unscheduled session
            const existingSession = unscheduledSessions[index];

            // Preserve existing assignments AS A SET if they exist, otherwise use new ones
            // This ensures the assignment fields remain consistent with the database constraint
            // Check all assignment fields, not just delivered_by
            const hasExistingAssignment =
              existingSession.delivered_by !== null ||
              existingSession.assigned_to_sea_id !== null ||
              existingSession.assigned_to_specialist_id !== null;
            const delivered_by = hasExistingAssignment ? existingSession.delivered_by : scheduledSession.delivered_by;
            const assigned_to_sea_id = hasExistingAssignment ? existingSession.assigned_to_sea_id : scheduledSession.assigned_to_sea_id;
            const assigned_to_specialist_id = hasExistingAssignment ? existingSession.assigned_to_specialist_id : scheduledSession.assigned_to_specialist_id;
            const service_type = hasExistingAssignment ? existingSession.service_type : scheduledSession.service_type;

            sessionsToUpdate.push({
              id: existingSession.id,
              updates: {
                day_of_week: scheduledSession.day_of_week,
                start_time: scheduledSession.start_time,
                end_time: scheduledSession.end_time,
                provider_id: scheduledSession.provider_id,
                service_type: service_type,
                assigned_to_sea_id: assigned_to_sea_id,
                assigned_to_specialist_id: assigned_to_specialist_id,
                delivered_by: delivered_by,
                status: 'active',
                conflict_reason: null
              }
            });
            this.log(`  Will UPDATE existing session ${existingSession.id} for ${student.initials}${hasExistingAssignment ? ` (preserving ${existingSession.delivered_by} assignment)` : ''}`);
          } else {
            // No unscheduled session available, need to insert new one
            sessionsToInsert.push(scheduledSession);
            this.log(`  Will INSERT new session for ${student.initials} (no unscheduled session available)`);
          }
        });

        // Update context with newly scheduled sessions
        this.updateContextWithSessions(result.scheduledSessions);
      }

      // Track success/failure based on whether ALL sessions were scheduled
      if (result.success) {
        results.totalScheduled++;
      } else {
        results.totalFailed++;
        results.errors.push(...result.errors);
        results.unplacedStudents.push(student);
      }
    }

    // Perform batch UPDATE for existing unscheduled sessions
    if (sessionsToUpdate.length > 0) {
      this.log(`Updating ${sessionsToUpdate.length} existing unscheduled sessions...`);

      let updateSuccessCount = 0;
      let updateFailCount = 0;

      for (const sessionUpdate of sessionsToUpdate) {
        const { error: updateError } = await this.supabase
          .from('schedule_sessions')
          .update(sessionUpdate.updates)
          .eq('id', sessionUpdate.id);

        if (updateError) {
          updateFailCount++;
          this.log(`Error updating session ${sessionUpdate.id}: ${updateError.message}`);
          results.errors.push(`Failed to update session: ${updateError.message}`);
        } else {
          updateSuccessCount++;
        }
      }

      this.performanceMetrics.totalQueries += sessionsToUpdate.length;
      this.log(`Successfully updated ${updateSuccessCount} sessions (${updateFailCount} failed)`);
    }

    // Perform batch INSERT only for sessions without existing unscheduled counterparts
    if (sessionsToInsert.length > 0) {
      this.log(`Inserting ${sessionsToInsert.length} new sessions (edge case - missing unscheduled sessions)...`);

      const { error: insertError } = await this.supabase
        .from("schedule_sessions")
        .insert(sessionsToInsert);

      this.performanceMetrics.totalQueries++;

      if (insertError) {
        results.errors.push(`Failed to insert sessions: ${insertError.message}`);
        this.context.cacheMetadata.fetchErrors.push(insertError.message);
      } else {
        this.log(`Successfully inserted ${sessionsToInsert.length} sessions`);
      }
    }
    
    // Check if manual placement is available for unplaced students
    if (results.unplacedStudents.length > 0 && this.manualPlacementService) {
      results.canManuallyPlace = true;
      
      // Get available slots that could be used for manual placement
      const studentIds = results.unplacedStudents.map(s => s.id);
      const availableSlots = await this.manualPlacementService.findAvailableSlots(
        studentIds,
        this.providerId,
        { ignoreConflicts: true, preferEarliestSlot: true }
      );
      
      if (availableSlots.length > 0) {
        results.availableSlots = availableSlots.map(slot => ({
          dayOfWeek: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          available: true,
          capacity: 1,
          conflicts: []
        }));
      }
    }
    
    // Log final performance metrics
    const batchElapsed = Date.now() - batchStartTime;
    this.log('[PERFORMANCE] Batch scheduling complete');
    this.log(`[PERFORMANCE] Time elapsed: ${batchElapsed}ms`);
    this.log(`[PERFORMANCE] Total queries executed: ${this.performanceMetrics.totalQueries}`);
    this.log(`[PERFORMANCE] Cache hits: ${this.performanceMetrics.cacheHits}`);
    this.log(`[PERFORMANCE] Query reduction: ${this.context.cacheMetadata.queryCount} initial vs ${this.performanceMetrics.totalQueries} total`);
    this.log(`[PERFORMANCE] Students scheduled: ${results.totalScheduled}/${students.length}`);

    return results;
  }

  /**
   * Schedule a single student using pre-computed valid slots
   */
  private scheduleStudent(student: Student): SchedulingResult {
    const result: SchedulingResult = {
      success: false,
      scheduledSessions: [],
      unscheduledStudents: [],
      errors: [],
    };
    
    // Validate cache before proceeding
    if (!this.validateCacheReady()) {
      result.errors.push(`Cache validation failed for student ${student.initials}`);
      return result;
    }

    // Calculate REMAINING sessions needed (not total sessions_per_week)
    const existingSessionsForStudent = this.context!.existingSessions
      .filter(s => s.student_id === student.id).length;
    const sessionsNeeded = Math.max(0, (student.sessions_per_week || 0) - existingSessionsForStudent);
    const duration = student.minutes_per_session || 30;

    this.log(
      `\nScheduling ${student.initials}: ${sessionsNeeded} sessions x ${duration}min (${existingSessionsForStudent} already scheduled)`,
    );
    this.log("Context available?", !!this.context);
    this.log("Valid slots in context:", this.context?.validSlots.size);

    // Find available slots for this student
    const availableSlots = this.findStudentSlots(
      student,
      duration,
      sessionsNeeded,
    );

    if (availableSlots.length < sessionsNeeded) {
      result.unscheduledStudents.push(student);
      result.errors.push(
        `${student.initials}: Only found ${availableSlots.length} of ${sessionsNeeded} required slots`,
      );
    }

    // Create sessions for available slots
    for (let i = 0; i < Math.min(availableSlots.length, sessionsNeeded); i++) {
      const slot = availableSlots[i];
      result.scheduledSessions.push({
        student_id: student.id,
        provider_id: this.providerId,
        day_of_week: slot.dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        service_type: this.providerRole,
        assigned_to_sea_id: this.providerRole === "sea" ? this.providerId : null,
        assigned_to_specialist_id: isSpecialistSourceRole(this.providerRole)
          ? this.providerId : null,
        delivered_by: this.providerRole === "sea"
          ? "sea"
          : isSpecialistSourceRole(this.providerRole)
            ? "specialist"
            : "provider",
        completed_at: null,
        completed_by: null,
        session_notes: null,
        session_date: null,
        manually_placed: false,
        is_completed: false,
        student_absent: false,
        outside_schedule_conflict: false,
        group_id: null,
        group_name: null,
        group_color: null,
        group_ref: null,
        status: 'active' as const,
        has_conflict: false,
        conflict_reason: null,
        deleted_at: null,
        template_id: null,
        is_template: true
      });
    }

    result.success = result.scheduledSessions.length === sessionsNeeded;
    this.log(
      `Scheduled ${result.scheduledSessions.length}/${sessionsNeeded} sessions for ${student.initials}`,
    );

    return result;
  }

  /**
   * Order students for placement (SPE-473).
   *
   * Hardest-first (most total minutes) is the base rule everywhere: the students
   * with the least room to move get first pick of the calendar.
   *
   * Grouping strategies additionally place peers back to back, so each student
   * is placed while the slot the previous peer landed in is the obvious choice.
   * Interleaving them by minutes instead — the old order — meant the first
   * student of each group landed in whatever slot was emptiest at that moment,
   * scattering the group before it ever formed. Hardest-first is preserved both
   * between groups (ranked by their hardest member) and inside each group.
   */
  private sortStudentsForStrategy(students: Student[]): Student[] {
    const byDifficulty = (a: Student, b: Student) => {
      const totalMinutesA = (a.sessions_per_week || 0) * (a.minutes_per_session || 0);
      const totalMinutesB = (b.sessions_per_week || 0) * (b.minutes_per_session || 0);
      if (totalMinutesB !== totalMinutesA) {
        return totalMinutesB - totalMinutesA;
      }
      // Equal total minutes: more sessions is harder to fit, so it goes first.
      return (b.sessions_per_week || 0) - (a.sessions_per_week || 0);
    };

    if (!isGroupingStrategy(this.strategy)) {
      return [...students].sort(byDifficulty);
    }

    const groups = new Map<string, Student[]>();
    for (const student of students) {
      // Students with nothing to group on stay individuals rather than being
      // pooled into one bogus "no teacher" group.
      const key = getGroupingKey(student, this.strategy) ?? `ungrouped:${student.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(student);
    }

    return [...groups.entries()]
      .map(([key, members]) => ({ key, members: [...members].sort(byDifficulty) }))
      .sort((a, b) =>
        byDifficulty(a.members[0], b.members[0]) || a.key.localeCompare(b.key)
      )
      .flatMap(group => group.members);
  }

  /**
   * Capacity ceilings to try, in order, when placing a student (SPE-473).
   *
   * The default two passes deliberately hold slots to 3 before allowing the full
   * group ceiling, which keeps a run from stacking students who have no reason
   * to share a slot. A student the active strategy can group opens at the
   * ceiling instead — otherwise a grade group would cap at 3 and the fourth
   * student would be pushed off to start a second group.
   *
   * Decided per student, not per run: in a "Group by teacher" run, a student
   * with no teacher recorded is placed by the balanced rules, so they should get
   * the balanced ladder too rather than stack denser than default for no
   * grouping benefit.
   */
  private getPassCapacities(student: Student): number[] {
    const groupCeiling = DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions;
    return getGroupingKey(student, this.strategy) ? [groupCeiling] : [3, groupCeiling];
  }

  /**
   * Find available slots for a specific student using two-pass distribution
   */
  private findStudentSlots(
    student: Student,
    duration: number,
    slotsNeeded: number
  ): TimeSlot[] {
    this.log(`\nFinding slots for ${student.initials} (Grade ${student.grade_level})`);

    const foundSlots: TimeSlot[] = [];

    // Use provider's actual work days at this school to prevent cross-school conflicts
    const validWorkDays = this.context!.workDays;

    // SPE-275: this used to substitute all five weekdays here too. `initializeContext`
    // now guarantees a non-empty list (defaulting for single-school providers,
    // throwing for multi-school ones), so reaching this branch means the context
    // was built by some other path. Place nothing rather than invent availability —
    // a missing session is recoverable, a session on a day the provider is at
    // another school is not.
    if (!validWorkDays || validWorkDays.length === 0) {
      console.warn(
        `[Scheduler] No work days in context for ${this.context!.schoolSite}; ` +
        `placing no sessions rather than assuming all weekdays.`
      );
      return foundSlots;
    }

    const groupKey = getGroupingKey(student, this.strategy);

    const sessionsOnDay = (day: number) =>
      this.context!.existingSessions.filter(s => s.day_of_week === day).length;

    // SPE-473: how many of this student's group are already on this day.
    //
    // Grouping has to be decided at the DAY level as well as the slot level.
    // Sorting days by emptiest alone actively defeats it: each peer placed makes
    // that day one session busier, so the next peer is pushed onto the next day
    // and the group ends up spread across the week — precisely what balanced
    // does. Ordering by peers first pulls the group back onto one day, where the
    // slot sort can then land them in the same time.
    //
    // The student's own sessions are excluded: they are not company, and they
    // are exactly the ones a later overlap check will reject.
    const peersOnDay = (day: number) =>
      !groupKey
        ? 0
        : this.context!.existingSessions.filter(
            s =>
              s.day_of_week === day &&
              s.student_id &&
              s.student_id !== student.id &&
              this.context!.studentGroupKeyMap.get(s.student_id) === groupKey &&
              // Same definition of "peer" the slot sort uses: a session someone
              // else delivers is a different group.
              this.isDeliveredByThisProvider(s)
          ).length;

    // Counted once per day rather than inside the comparator, which would
    // rescan every session on each comparison, for every student in the batch.
    const peerCounts = new Map(validWorkDays.map(day => [day, peersOnDay(day)]));
    const sessionCounts = new Map(validWorkDays.map(day => [day, sessionsOnDay(day)]));

    // Sort days to distribute sessions evenly when possible. With no grouping
    // key every day scores 0 peers, so this reduces exactly to the previous
    // emptiest-day-first ordering.
    const sortedDays = [...validWorkDays].sort(
      (a, b) =>
        (peerCounts.get(b)! - peerCounts.get(a)!) ||
        (sessionCounts.get(a)! - sessionCounts.get(b)!)
    );

    this.log(`Work days from context: ${this.context!.workDays}`);
    this.log(`Valid work days: ${validWorkDays.join(', ')}`);
    this.log(`Sorted days for distribution: ${sortedDays.join(', ')}`);

    // CAPACITY-LADDER DISTRIBUTION STRATEGY
    // Each pass retries the days at a higher per-slot ceiling, so sessions only
    // stack once the roomier options are exhausted. Which ceilings apply depends
    // on the strategy (SPE-473).
    for (const maxCapacity of this.getPassCapacities(student)) {
      if (foundSlots.length >= slotsNeeded) break;

      this.log(`\n=== PASS: Need ${slotsNeeded - foundSlots.length} more slots, allowing up to ${maxCapacity} per slot ===`);
      foundSlots.push(
        ...this.findSlotsWithCapacityLimit(
          student,
          duration,
          slotsNeeded - foundSlots.length,
          sortedDays,
          maxCapacity,
          foundSlots // Pass existing slots to avoid duplicates
        )
      );
    }

    this.log(`\n=== RESULT: Found ${foundSlots.length}/${slotsNeeded} slots for ${student.initials} ===`);
    return foundSlots;
  }

  /**
   * Helper method to find slots with a specific capacity limit
   */
  private findSlotsWithCapacityLimit(
    student: Student,
    duration: number,
    slotsNeeded: number,
    sortedDays: number[],
    maxCapacity: number,
    existingFoundSlots: TimeSlot[] = []
  ): TimeSlot[] {
    const foundSlots: TimeSlot[] = [];

    // Try to find slots
    for (const day of sortedDays) {
      if (foundSlots.length >= slotsNeeded) break;

      this.log(`\nChecking day ${day}, foundSlots.length: ${foundSlots.length}, slotsNeeded: ${slotsNeeded}`);

      // Get all valid slots for this day
      const daySlots = Array.from(this.context!.validSlots.entries())
        .filter(([key, slot]) => slot.dayOfWeek === day && slot.capacity > 0)
        .map(([key, slot]) => ({ key, ...slot }));

      // Sort slots with grade-level grouping preference
      const sortedDaySlots = this.sortSlotsForStrategy(daySlots, day, student);

      this.log(`Day ${day}: Found ${sortedDaySlots.length} potential slots`);

      // Check how many sessions we already have scheduled for this student on this day
      const sessionsOnThisDay = [...existingFoundSlots, ...foundSlots].filter(s => s.dayOfWeek === day).length;

      // If we already have 2 sessions on this day, try to distribute to other days
      // (unless this is our last available day or we're close to having all needed slots)
      if (sessionsOnThisDay >= 2) {
        const remainingDaysToCheck = sortedDays.length - (sortedDays.indexOf(day) + 1);
        const slotsStillNeeded = slotsNeeded - foundSlots.length;

        if (remainingDaysToCheck > 0 && slotsStillNeeded > 1) {
          this.log(`  Day ${day}: Already have ${sessionsOnThisDay} sessions scheduled. Moving to next day for better distribution.`);
          continue; // Skip to next day
        }
      }

      // Check each slot for student-specific constraints
      for (const slotInfo of sortedDaySlots) {
        if (foundSlots.length >= slotsNeeded) {
          this.log(`Found enough slots, breaking from slot loop`);
          break;  // This breaks from the slot loop, not the day loop
        }

        const slot = slotInfo;
        const endTime = this.addMinutesToTime(slot.startTime, duration);

        this.log(`  Checking slot ${slot.startTime}-${endTime}`);

        // Check if session extends beyond school hours for this grade
        const schoolHours = this.getSchoolHoursForGrade(day, student.grade_level.trim(), slot.startTime);
        const schoolStartMinutes = this.timeToMinutes(schoolHours.start);
        const schoolEndMinutes = this.timeToMinutes(schoolHours.end);
        const sessionStartMinutes = this.timeToMinutes(slot.startTime);
        const sessionEndMinutes = this.timeToMinutes(endTime);

        if (sessionStartMinutes < schoolStartMinutes || sessionEndMinutes > schoolEndMinutes) {
          this.log(`    ❌ Session outside school hours (${schoolHours.start} - ${schoolHours.end})`);
          continue;
        }

        // Check bell schedule conflicts using cached index (O(1) lookup)
        const studentGrade = student.grade_level.trim();
        const gradeBellSchedules = this.context!.bellSchedulesByGrade.get(studentGrade)?.get(day) || [];
        
        const hasBellConflict = gradeBellSchedules.some(bell => {
          const hasTimeOverlap = this.hasTimeOverlap(slot.startTime, endTime, bell.start_time, bell.end_time);
          
          if (hasTimeOverlap) {
            this.log(`    ❌ Bell schedule conflict: ${bell.period_name} for grade ${student.grade_level}`);
            this.performanceMetrics.cacheHits++;
          }
          
          return hasTimeOverlap;
        });
        
        if (hasBellConflict) continue;

        // Check special activities using cached index (O(1) lookup)
        const teacherActivities = student.teacher_name 
          ? this.context!.specialActivitiesByTeacher.get(student.teacher_name)?.get(day) || []
          : [];
        
        const hasActivityConflict = teacherActivities.some(activity => {
          const hasTimeOverlap = this.hasTimeOverlap(slot.startTime, endTime, activity.start_time, activity.end_time);
          
          if (hasTimeOverlap) {
            this.log(`    ❌ Special activity conflict: ${activity.activity_name} for teacher ${student.teacher_name}`);
            this.performanceMetrics.cacheHits++;
          }
          
          return hasTimeOverlap;
        });
        
        if (hasActivityConflict) continue;

        // Check for overlapping sessions FIRST
        if (!this.validateNoOverlap(student, day, slot.startTime, endTime, [...existingFoundSlots, ...foundSlots])) {
          this.log(`    ❌ Session overlap detected`);
          continue;
        }

        // SPE-287: hard-avoid double-booking a SHARED student across providers. The other
        // provider's session is blocked time for THIS child (one kid can't be in two rooms
        // at once), so the auto-scheduler never places on top of it — unlike the interactive
        // drag, which warns but lets the provider override.
        if (this.hasCrossProviderConflict(student.id, day, slot.startTime, endTime)) {
          this.log(`    ❌ Cross-provider double-book (shared student with another provider)`);
          continue;
        }

        // Check consecutive session rules (max 60 minutes without break)
        if (!this.validateConsecutiveSessionRules(student, day, slot.startTime, endTime, [...existingFoundSlots, ...foundSlots])) {
          this.log(`    ❌ Consecutive session rule violation`);
          continue;
        }

        // Check break requirements (30-minute break between non-consecutive sessions) - PASSING foundSlots
        if (!this.validateBreakRequirements(student, day, slot.startTime, endTime, [...existingFoundSlots, ...foundSlots])) {
          this.log(`    ❌ Break requirement violation`);
          continue;
        }

        // Check capacity limit for this pass
        const overlappingSessions = this.context!.existingSessions.filter(
          (session) =>
            session.day_of_week === day &&
            this.hasTimeOverlap(slot.startTime, endTime, session.start_time, session.end_time),
        );
        
        if (overlappingSessions.length >= maxCapacity) {
          this.log(`    ❌ Slot at capacity (${overlappingSessions.length}/${maxCapacity} sessions)`);
          continue;
        }

        // Valid slot found!
        this.log(`    ✅ Valid slot found! Current capacity: ${overlappingSessions.length}/${maxCapacity}`);
        foundSlots.push({
          ...slot,
          endTime
        });
      }
    }

    this.log(`Found ${foundSlots.length} slots for ${student.initials}`);
    return foundSlots;
  }

  /**
   * Check if the proposed session overlaps with any existing sessions for this student
   */
  private validateNoOverlap(
    student: Student,
    day: number,
    newStartTime: string,
    newEndTime: string,
    foundSlots: TimeSlot[] = []
  ): boolean {
    const newStart = this.timeToMinutes(newStartTime);
    const newEnd = this.timeToMinutes(newEndTime);

    // Check against existing sessions in database
    for (const existing of this.context!.existingSessions) {
      if (existing.student_id === student.id && existing.day_of_week === day) {
        const existingStart = this.timeToMinutes(existing.start_time);
        const existingEnd = this.timeToMinutes(existing.end_time);

        if (!(newEnd <= existingStart || newStart >= existingEnd)) {
          this.log(`    ❌ Overlaps with existing session ${existing.start_time}-${existing.end_time}`);
          return false;
        }
      }
    }

    // Check against already found slots
    for (const slot of foundSlots) {
      if (slot.dayOfWeek === day) {
        const slotStart = this.timeToMinutes(slot.startTime);
        const slotEnd = this.timeToMinutes(slot.endTime);

        if (!(newEnd <= slotStart || newStart >= slotEnd)) {
          this.log(`    ❌ Overlaps with found slot ${slot.startTime}-${slot.endTime}`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * SPE-287: does placing this student here double-book them with ANOTHER provider?
   * True when the slot overlaps one of the student's cross-provider sessions (a shared
   * child, e.g. RSP + Speech). Reuses findOverlappingOtherProviderSession so the
   * auto-scheduler, the interactive drag warning, and the grey "other provider" bands
   * share identical overlap semantics. No entry for a student => never a conflict.
   */
  private hasCrossProviderConflict(
    studentId: string,
    day: number,
    startTime: string,
    endTime: string
  ): boolean {
    const sessions = this.context!.crossProviderSessionsByStudent.get(studentId);
    if (!sessions || sessions.length === 0) return false;
    return findOverlappingOtherProviderSession(sessions, day, startTime, endTime) !== null;
  }

  /**
   * Validate consecutive session rules (max 60 minutes without break)
   */
  private validateConsecutiveSessionRules(
    student: Student,
    day: number,
    newStartTime: string,
    newEndTime: string,
    foundSlots: TimeSlot[] = []
  ): boolean {
    const newSessionProposed = {
      startMinutes: this.timeToMinutes(newStartTime),
      endMinutes: this.timeToMinutes(newEndTime),
      duration: this.timeToMinutes(newEndTime) - this.timeToMinutes(newStartTime)
    };

    // Get existing sessions from database
    const existingStudentSessions = this.context!.existingSessions
      .filter(s => s.student_id === student.id && s.day_of_week === day)
      .map(s => ({
        startMinutes: this.timeToMinutes(s.start_time),
        endMinutes: this.timeToMinutes(s.end_time),
        duration: this.timeToMinutes(s.end_time) - this.timeToMinutes(s.start_time)
      }));

    // Get already found slots for this day
    const foundSessionsOnDay = foundSlots
      .filter(slot => slot.dayOfWeek === day)
      .map(slot => ({
        startMinutes: this.timeToMinutes(slot.startTime),
        endMinutes: this.timeToMinutes(slot.endTime),
        duration: this.timeToMinutes(slot.endTime) - this.timeToMinutes(slot.startTime)
      }));

    // Combine all sessions including the proposed one
    const allStudentSessionsOnDay = [
      ...existingStudentSessions,
      ...foundSessionsOnDay,
      newSessionProposed
    ];

    // Sort sessions by start time
    allStudentSessionsOnDay.sort((a, b) => a.startMinutes - b.startMinutes);

    // ADD LOGGING HERE:
    this.log(`    Checking consecutive sessions for ${student.initials} on day ${day}:`);
    allStudentSessionsOnDay.forEach((session, i) => {
      const startTime = `${Math.floor(session.startMinutes / 60).toString().padStart(2, '0')}:${(session.startMinutes % 60).toString().padStart(2, '0')}`;
      const endTime = `${Math.floor(session.endMinutes / 60).toString().padStart(2, '0')}:${(session.endMinutes % 60).toString().padStart(2, '0')}`;
      this.log(`      Session ${i + 1}: ${startTime}-${endTime} (${session.duration}min)`);
    });

    if (allStudentSessionsOnDay.length === 0) {
      return true; // No sessions, so no conflict
    }

    // Sort sessions by start time
    allStudentSessionsOnDay.sort((a, b) => a.startMinutes - b.startMinutes);

    if (allStudentSessionsOnDay.length === 0) {
      return true; // No sessions, so no conflict
    }

    // Iterate through sorted sessions to find consecutive blocks
    let currentConsecutiveDuration = 0;
    let lastSessionEndMinutes = -1;

    for (let i = 0; i < allStudentSessionsOnDay.length; i++) {
      const session = allStudentSessionsOnDay[i];

      if (session.duration > 60) {
        // A single session cannot be longer than 60 minutes if that's an implicit part of the rule
        this.log(`    ❌ Single session duration ${session.duration} mins exceeds 60 mins`);
        return false;
      }

      if (lastSessionEndMinutes === session.startMinutes) {
        // This session is consecutive with the previous one
        currentConsecutiveDuration += session.duration;
      } else {
        // This session starts a new block (or is the first one)
        currentConsecutiveDuration = session.duration;
      }

      if (currentConsecutiveDuration > 60) {
        this.log(`    ❌ Consecutive session block of ${currentConsecutiveDuration} mins exceeds 60 mins`);
        return false;
      }

      lastSessionEndMinutes = session.endMinutes;
    }

    return true;
  }

  /**
   * Validate break requirements (30-minute break between non-consecutive sessions)
   */
  private validateBreakRequirements(
    student: Student,
    day: number,
    newStartTime: string,
    newEndTime: string,
    foundSlots: TimeSlot[] = []
  ): boolean {
    const newSessionProposed = {
      startMinutes: this.timeToMinutes(newStartTime),
      endMinutes: this.timeToMinutes(newEndTime)
    };

    // Get existing sessions from database
    const existingStudentSessions = this.context!.existingSessions
      .filter(s => s.student_id === student.id && s.day_of_week === day)
      .map(s => ({
        startMinutes: this.timeToMinutes(s.start_time),
        endMinutes: this.timeToMinutes(s.end_time)
      }));

    // Get already found slots for this day
    const foundSessionsOnDay = foundSlots
      .filter(slot => slot.dayOfWeek === day)
      .map(slot => ({
        startMinutes: this.timeToMinutes(slot.startTime),
        endMinutes: this.timeToMinutes(slot.endTime)
      }));

    // Combine all sessions including the proposed one
    const allStudentSessionsOnDay = [
      ...existingStudentSessions,
      ...foundSessionsOnDay,
      newSessionProposed
    ];

    // Sort sessions by start time
    allStudentSessionsOnDay.sort((a, b) => a.startMinutes - b.startMinutes);

    // ADD LOGGING HERE:
    this.log(`    Checking break requirements for ${student.initials} on day ${day}:`);
    if (allStudentSessionsOnDay.length > 1) {
      for (let i = 0; i < allStudentSessionsOnDay.length - 1; i++) {
        const current = allStudentSessionsOnDay[i];
        const next = allStudentSessionsOnDay[i + 1];
        const gap = next.startMinutes - current.endMinutes;
        if (gap > 0) {
          this.log(`      Gap between session ${i + 1} and ${i + 2}: ${gap} minutes`);
        }
      }
    }

    if (allStudentSessionsOnDay.length <= 1) {
      return true; // Not enough sessions to have a break requirement issue
    }

    // Iterate through sorted sessions to check gaps between non-consecutive sessions
    for (let i = 0; i < allStudentSessionsOnDay.length - 1; i++) {
      const currentSession = allStudentSessionsOnDay[i];
      const nextSession = allStudentSessionsOnDay[i + 1];

      // Check if they are NOT consecutive
      if (currentSession.endMinutes < nextSession.startMinutes) {
        const breakDuration = nextSession.startMinutes - currentSession.endMinutes;
        if (breakDuration < 30) {
          this.log(`    ❌ Insufficient break: ${breakDuration} mins between sessions (requires 30 mins)`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Update context after scheduling sessions
   */
  private updateContextWithSessions(
    sessions: Omit<ScheduleSession, "id" | "created_at" | "updated_at">[],
  ) {
    // Filter to only scheduled sessions (defensive check, though scheduler should only create scheduled sessions)
    const scheduledSessions = sessions.filter(s =>
      s.day_of_week !== null && s.start_time !== null && s.end_time !== null
    ) as (Omit<ScheduleSession, "id" | "created_at" | "updated_at"> & {
      day_of_week: number;
      start_time: string;
      end_time: string;
    })[];

    for (const session of scheduledSessions) {
      // Update capacity for ALL time slots affected by this session
      const sessionStartMinutes = this.timeToMinutes(session.start_time);
      const sessionEndMinutes = this.timeToMinutes(session.end_time);

      // Check every 5-minute slot to see if it overlaps with this session
      for (const [key, slot] of this.context!.validSlots.entries()) {
        if (slot.dayOfWeek === session.day_of_week) {
          const slotStartMinutes = this.timeToMinutes(slot.startTime);
          const slotEndMinutes = slotStartMinutes + 5; // 5-minute slots

          // Check if this slot overlaps with the session
          if (
            !(
              slotEndMinutes <= sessionStartMinutes ||
              slotStartMinutes >= sessionEndMinutes
            )
          ) {
            // This slot overlaps with the session, reduce capacity
            slot.capacity--;
            if (slot.capacity <= 0) {
              this.context!.validSlots.delete(key);
            }
          }
        }
      }

      // Also add to existing sessions for future constraint checking
      this.context!.existingSessions.push({
        id: "temp-" + Math.random(),
        student_id: session.student_id,
        provider_id: session.provider_id,
        day_of_week: session.day_of_week,
        start_time: session.start_time,
        end_time: session.end_time,
        service_type: session.service_type,
        assigned_to_sea_id: session.assigned_to_sea_id,
        assigned_to_specialist_id: session.assigned_to_specialist_id || null,
        delivered_by: session.delivered_by,
        completed_at: session.completed_at,
        completed_by: session.completed_by,
        session_notes: session.session_notes,
        session_date: session.session_date,
        manually_placed: session.manually_placed || false,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_completed: session.is_completed || false,
        student_absent: session.student_absent || false,
        outside_schedule_conflict: session.outside_schedule_conflict || false,
        group_id: session.group_id || null,
        group_name: session.group_name || null,
        group_color: session.group_color || null,
        group_ref: (session as { group_ref?: string | null }).group_ref ?? null,
        status: session.status || 'active',
        has_conflict: session.has_conflict || false,
        conflict_reason: session.conflict_reason || null,
        deleted_at: session.deleted_at ?? null,
        template_id: session.template_id || null,
        is_template: session.is_template ?? true
      });
    }
  }

  /**
   * Generate time slots based on school hours
   */
  private generateTimeSlots(startHour: number = 8, endHour: number = 14): string[] {
    const slots: string[] = [];
    // Generate slots every 5 minutes for maximum flexibility
    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        // Don't go past end hour:30 to leave buffer
        if (hour === endHour && minute > 30) break;
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
  }

  private hasTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    const start1Min = this.timeToMinutes(start1);
    const end1Min = this.timeToMinutes(end1);
    const start2Min = this.timeToMinutes(start2);
    const end2Min = this.timeToMinutes(end2);
    return !(end1Min <= start2Min || start1Min >= end2Min);
  }

  private timesOverlap(
    time: string,
    sessionStart: string,
    sessionEnd: string,
  ): boolean {
    const timeMin = this.timeToMinutes(time);
    const startMin = this.timeToMinutes(sessionStart);
    const endMin = this.timeToMinutes(sessionEnd);
    return timeMin >= startMin && timeMin < endMin;
  }

  /**
   * Sort slots with preference for grade-level grouping
   * Prioritizes slots that already have sessions with the same grade level
   */
  /**
   * Attempt manual placement for unscheduled students
   */
  async tryManualPlacement(
    students: Student[],
    ignoreConflicts: boolean = true
  ): Promise<{
    success: boolean;
    placedSessions: any[];
    failedStudents: Student[];
    errors: string[];
  }> {
    if (!this.manualPlacementService) {
      return {
        success: false,
        placedSessions: [],
        failedStudents: students,
        errors: ['Manual placement service not initialized']
      };
    }

    const studentIds = students.map(s => s.id);
    const results = await this.manualPlacementService.placeSessionsWithConflicts(
      studentIds,
      this.providerId,
      { ignoreConflicts, preferEarliestSlot: true }
    );

    const placedSessions: any[] = [];
    const failedStudents: Student[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === 'success') {
        placedSessions.push({
          studentId: result.studentId,
          sessionId: result.sessionId,
          timeSlot: result.timeSlot,
          conflicts: result.conflicts
        });
      } else {
        const student = students.find(s => s.id === result.studentId);
        if (student) {
          failedStudents.push(student);
        }
        if (result.error) {
          errors.push(`${result.studentId}: ${result.error}`);
        }
      }
    }

    return {
      success: placedSessions.length > 0,
      placedSessions,
      failedStudents,
      errors
    };
  }

  /**
   * Get performance metrics for monitoring and optimization
   */
  public getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheMetadata: this.context?.cacheMetadata || null
    };
  }
  
  /**
   * Reset performance metrics for new scheduling session
   */
  public resetPerformanceMetrics() {
    this.performanceMetrics = {
      totalQueries: 0,
      batchQueries: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }
  
  /**
   * Whether this session is one the person running the scheduler delivers
   * themselves (SPE-473).
   *
   * A group is same day + same start time + **same deliverer** (Groups v2), so a
   * session delegated to somebody else forms its own group and joining its slot
   * would not group these students at all. The scheduler's caseload legitimately
   * mixes the two: a provider's own sessions sit alongside ones handed to an SEA
   * or another specialist.
   *
   * Decided from the assignment columns rather than the `delivered_by` label,
   * because the label is not written consistently across the app — the
   * auto-scheduler stamps a resource provider's own sessions `specialist` while
   * every other write path stamps them `provider` (606 vs 7 rows in prod). The
   * assignment ids do not have that ambiguity: they are set precisely when the
   * session belongs to someone other than the owning provider.
   */
  private isDeliveredByThisProvider(session: {
    assigned_to_sea_id?: string | null;
    assigned_to_specialist_id?: string | null;
    provider_id?: string | null;
  }): boolean {
    if (session.assigned_to_sea_id) return session.assigned_to_sea_id === this.providerId;
    if (session.assigned_to_specialist_id) {
      return session.assigned_to_specialist_id === this.providerId;
    }
    return session.provider_id === this.providerId;
  }

  /**
   * Order a day's candidate slots by how well each one serves the active
   * strategy (SPE-473). Every slot in `slots` is already legal for this student;
   * this only decides which is tried first.
   */
  private sortSlotsForStrategy(
    slots: Array<any>,
    day: number,
    student: Student
  ): Array<any> {
    const targetGrade = student.grade_level?.trim() ?? '';
    // Null when the strategy doesn't group, or when this student is missing the
    // field it groups on — either way they fall through to balanced placement.
    const targetGroupKey = getGroupingKey(student, this.strategy);

    // For each slot, count the company a session placed here would keep
    const slotsWithGradeCounts = slots.map(slot => {
      // Crowding is measured over a fixed 30-minute probe, as it always has
      // been. It is a coarse "how busy is this slot" proxy that feeds the
      // balanced ordering; widening it here would shift default placements.
      const overlappingSessions = this.context!.existingSessions.filter(
        (session) =>
          session.day_of_week === day &&
          this.hasTimeOverlap(slot.startTime, this.addMinutesToTime(slot.startTime, 30), session.start_time, session.end_time)
      );

      // Count sessions with matching grade
      let sameGradeCount = 0;
      let otherGradeCount = 0;

      for (const session of overlappingSessions) {
        if (!session.student_id) continue; // Skip sessions without student_id
        const sessionGrade = this.context!.studentGradeMap.get(session.student_id);
        if (sessionGrade) {
          if (sessionGrade === targetGrade) {
            sameGradeCount++;
          } else {
            otherGradeCount++;
          }
        }
      }

      // Peers this student would actually be grouped WITH (SPE-473).
      //
      // Deliberately exact start-time alignment, not overlap. Membership in this
      // product derives from the schedule: same day + same start time + same
      // deliverer is one group (Groups v2). A session merely overlapping the
      // group — 08:35 against a group at 09:00 — is not in it, and scoring by
      // overlap actively produces those near-misses, because an overlapping
      // earlier slot ties on peer count and then wins the time tiebreak.
      const slotStartMinutes = this.timeToMinutes(slot.startTime);
      let sameGroupCount = 0;
      if (targetGroupKey) {
        for (const session of this.context!.existingSessions) {
          if (session.day_of_week !== day) continue;
          // A student's own sessions are not company, and a slot colliding with
          // them is one a later overlap check will reject anyway.
          if (!session.student_id || session.student_id === student.id) continue;
          if (this.context!.studentGroupKeyMap.get(session.student_id) !== targetGroupKey) continue;
          // A session delivered by someone else forms its own group, so joining
          // its slot would not group these students at all.
          if (!this.isDeliveredByThisProvider(session)) continue;
          if (this.timeToMinutes(session.start_time) === slotStartMinutes) {
            sameGroupCount++;
          }
        }
      }

      return {
        ...slot,
        sameGradeCount,
        otherGradeCount,
        sameGroupCount,
        totalSessions: overlappingSessions.length
      };
    });

    const byTime = (a: any, b: any) =>
      this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime);

    if (targetGroupKey) {
      // Grouping: joining peers is the whole point, so it outranks spreading.
      // Even distribution still breaks ties, which is what seeds the first
      // member of a group into a roomy slot rather than a crowded one.
      return slotsWithGradeCounts.sort((a, b) =>
        (b.sameGroupCount - a.sameGroupCount) ||
        (a.totalSessions - b.totalSessions) ||
        byTime(a, b)
      );
    }

    if (this.strategy === 'morning-first') {
      // Earliest first; per-slot capacity and the per-day session cap are what
      // stop everyone from landing on the same 8:00 AM slot.
      return slotsWithGradeCounts.sort((a, b) =>
        byTime(a, b) || (a.totalSessions - b.totalSessions)
      );
    }

    // Balanced (and any grouping strategy for a student with nothing to group on).
    // Sort by:
    // 1. Prefer slots with same grade (but only as secondary criteria)
    // 2. Primary criteria is even distribution (fewer total sessions)
    // 3. Then by time for chronological ordering
    return slotsWithGradeCounts.sort((a, b) => {
      // First priority: Even distribution (prefer slots with fewer total sessions)
      if (a.totalSessions !== b.totalSessions) {
        return a.totalSessions - b.totalSessions;
      }
      
      // Second priority: Grade grouping (prefer slots with more same-grade sessions)
      // Only apply if both slots have the same total capacity usage
      if (a.sameGradeCount !== b.sameGradeCount) {
        return b.sameGradeCount - a.sameGradeCount; // Descending (more same-grade is better)
      }
      
      // Third priority: Time order
      return this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime);
    });
  }
}
