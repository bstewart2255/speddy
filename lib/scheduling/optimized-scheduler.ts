import { createClient } from '@/lib/supabase/client';
import { Database } from "../../src/types/database";
import { SchedulingDataManager } from './scheduling-data-manager';
import { ManualPlacementService } from '../services/manual-placement-service';
import type {
  Student,
  ScheduleSession,
  BellSchedule,
  SpecialActivity
} from './types/scheduling-data';

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
  existingSessions: ScheduleSession[];
  validSlots: Map<string, TimeSlot>;
  schoolHours: Array<{  // Add this
    day_of_week: number;
    grade_level: string;
    start_time: string;
    end_time: string;
  }>;
  studentGradeMap: Map<string, string>; // Map student ID to grade level
  
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
    debug: boolean = false
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
    
    // Get all existing sessions
    const existingSessions = this.dataManager.getExistingSessions();
    
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
    const schoolHours = [];
    
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
      schoolHours
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
  async initializeContext(schoolSite: string, schoolDistrict?: string): Promise<SchedulingContext> {
    this.log(`Initializing scheduling context for ${schoolSite}...`);
    this.log('[PERFORMANCE] Query count before initialization:', this.performanceMetrics.totalQueries);

    // Initialize the data manager if not already initialized
    if (!this.dataManager.isInitialized()) {
      // Use empty string as fallback for backward compatibility
      await this.dataManager.initialize(this.providerId, schoolSite, schoolDistrict || '', undefined);
    }

    // Use data manager instead of direct queries
    const preloadedData = await this.getDataFromManager(schoolSite);
    
    // Extract work days from preloaded data
    const workDays = preloadedData.workSchedule?.map((s: any) => s.day_of_week) || [];
    
    // If no work schedule defined, assume all weekdays (backwards compatibility)
    if (workDays.length === 0) {
      // Check if provider has any schedule at all (already in preloaded data)
      if (!preloadedData.workSchedule || preloadedData.workSchedule.length === 0) {
        workDays.push(1, 2, 3, 4, 5);
      }
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
    
    // Build provider availability map
    const providerKey = `${this.providerId}-${schoolSite}`;
    providerAvailability.set(providerKey, new Map());
    for (const day of workDays) {
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
      existingSessions: preloadedData.existingSessions || [],
      validSlots: new Map(),
      schoolHours: preloadedData.schoolHours || [],
      studentGradeMap: new Map(),
      
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

    // Only check days when provider works at this school
    for (const day of context.workDays) {
      for (const startTime of timeSlots) {
        totalSlots++;
        const slot: TimeSlot = {
          dayOfWeek: day,
          startTime,
          endTime: "", // Will be set based on session duration
          available: true,
          capacity: 6, // Updated to 6 as per new rules
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
  async scheduleBatch(students: Student[]): Promise<EnhancedSchedulingResult> {
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

    // Populate student grade map for grade grouping optimization
    students.forEach(student => {
      this.context!.studentGradeMap.set(student.id, student.grade_level.trim());
    });

    // Sort students by total minutes needed (descending) to handle harder cases first
    const sortedStudents = [...students].sort((a, b) => {
      const totalMinutesA = a.sessions_per_week * a.minutes_per_session;
      const totalMinutesB = b.sessions_per_week * b.minutes_per_session;

      // First sort by total minutes
      if (totalMinutesB !== totalMinutesA) {
        return totalMinutesB - totalMinutesA;
      }

      // If total minutes are equal, sort by number of sessions (more sessions = harder to schedule)
      return b.sessions_per_week - a.sessions_per_week;
    });

    this.log('Student scheduling order:');
    sortedStudents.forEach(s => {
      const totalMinutes = s.sessions_per_week * s.minutes_per_session;
      this.log(`  ${s.initials}: ${s.sessions_per_week} sessions × ${s.minutes_per_session}min = ${totalMinutes} total minutes`);
    });

    const allScheduledSessions: Omit<
      ScheduleSession,
      "id" | "created_at" | "updated_at"
    >[] = [];

    for (const student of sortedStudents) {
      this.log(
        `\nScheduling ${student.initials}: ${student.sessions_per_week} sessions x ${student.minutes_per_session}min`,
      );

      const result = this.scheduleStudent(student);

      if (result.success) {
        results.totalScheduled++;
        allScheduledSessions.push(...result.scheduledSessions);

        // Update context with newly scheduled sessions
        this.updateContextWithSessions(result.scheduledSessions);
      } else {
        results.totalFailed++;
        results.errors.push(...result.errors);
        results.unplacedStudents.push(student);
      }
    }

    // Save all sessions at once
    if (allScheduledSessions.length > 0) {
      const { error } = await this.supabase
        .from("schedule_sessions")
        .insert(allScheduledSessions);
        
      this.performanceMetrics.totalQueries++; // Count the insert query

      if (error) {
        results.errors.push(`Failed to save sessions: ${error.message}`);
        this.context.cacheMetadata.fetchErrors.push(error.message);
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

    const sessionsNeeded = student.sessions_per_week;
    const duration = student.minutes_per_session;

    this.log(
      `\nScheduling ${student.initials}: ${sessionsNeeded} sessions x ${duration}min`,
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
        assigned_to_specialist_id: ['speech', 'ot', 'counseling', 'specialist'].includes(this.providerRole) 
          ? this.providerId : null,
        delivered_by: this.providerRole === "sea" 
          ? "sea" 
          : ['speech', 'ot', 'counseling', 'specialist'].includes(this.providerRole)
            ? "specialist"
            : "provider",
        completed_at: null,
        completed_by: null,
        session_notes: null,
        session_date: null,
        manually_placed: false
      });
    }

    result.success = result.scheduledSessions.length === sessionsNeeded;
    this.log(
      `Scheduled ${result.scheduledSessions.length}/${sessionsNeeded} sessions for ${student.initials}`,
    );

    return result;
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

    // Validate that we only check work days for this school
    const validWorkDays = this.context!.workDays.filter(day => day >= 1 && day <= 5);

    if (validWorkDays.length === 0) {
      this.log(`❌ No valid work days found for ${this.context!.schoolSite}`);
      return [];
    }

    // Sort days to distribute sessions evenly when possible
    const sortedDays = [...validWorkDays].sort((a, b) => {
      const aCount = this.context!.existingSessions.filter(s => s.day_of_week === a).length;
      const bCount = this.context!.existingSessions.filter(s => s.day_of_week === b).length;
      return aCount - bCount;
    });

    this.log(`Work days from context: ${this.context!.workDays}`);
    this.log(`Valid work days: ${validWorkDays.join(', ')}`);
    this.log(`Sorted days for distribution: ${sortedDays.join(', ')}`);

    // TWO-PASS DISTRIBUTION STRATEGY
    // First pass: Try to distribute with max 3 sessions per slot
    this.log("\n=== FIRST PASS: Distribute with max 3 sessions per slot ===");
    foundSlots.push(...this.findSlotsWithCapacityLimit(student, duration, slotsNeeded, sortedDays, 3));

    // Second pass: If we need more slots, allow up to 6 sessions per slot
    if (foundSlots.length < slotsNeeded) {
      this.log(`\n=== SECOND PASS: Need ${slotsNeeded - foundSlots.length} more slots, allowing up to 6 per slot ===`);
      const additionalSlots = this.findSlotsWithCapacityLimit(
        student, 
        duration, 
        slotsNeeded - foundSlots.length, 
        sortedDays, 
        6,
        foundSlots // Pass existing slots to avoid duplicates
      );
      foundSlots.push(...additionalSlots);
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
      const sortedDaySlots = this.sortSlotsWithGradePreference(daySlots, day, student.grade_level.trim());

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
        const teacherActivities = this.context!.specialActivitiesByTeacher.get(student.teacher_name)?.get(day) || [];
        
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
    for (const session of sessions) {
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
  
  private sortSlotsWithGradePreference(
    slots: Array<any>,
    day: number,
    targetGrade: string
  ): Array<any> {
    // For each slot, count how many sessions of the same grade are already there
    const slotsWithGradeCounts = slots.map(slot => {
      const overlappingSessions = this.context!.existingSessions.filter(
        (session) =>
          session.day_of_week === day &&
          this.hasTimeOverlap(slot.startTime, this.addMinutesToTime(slot.startTime, 30), session.start_time, session.end_time)
      );

      // Count sessions with matching grade
      let sameGradeCount = 0;
      let otherGradeCount = 0;
      
      for (const session of overlappingSessions) {
        const sessionGrade = this.context!.studentGradeMap.get(session.student_id);
        if (sessionGrade) {
          if (sessionGrade === targetGrade) {
            sameGradeCount++;
          } else {
            otherGradeCount++;
          }
        }
      }

      return {
        ...slot,
        sameGradeCount,
        otherGradeCount,
        totalSessions: overlappingSessions.length
      };
    });

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
