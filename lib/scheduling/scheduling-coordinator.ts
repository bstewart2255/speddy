import { createClient } from '@/lib/supabase/client';
import { SchedulingDataManager } from './scheduling-data-manager';
import { ConstraintValidator } from './constraint-validator';
import { SessionDistributor } from './session-distributor';
import { SchedulingEngine, SchedulingEngineConfig } from './scheduling-engine';
import type {
  TimeSlot,
  SchedulingContext,
  SchedulingConstraints,
  SchedulingResult,
  AvailabilitySlot
} from './types/scheduling-types';
import type {
  Student,
  ScheduleSession,
  BellSchedule,
  SpecialActivity
} from './types/scheduling-data';
import type { ValidationResult } from './types/validation-result';
import type { DistributionStrategy, DistributionContext } from './types/distribution-strategy';

export interface BatchSchedulingResult {
  totalScheduled: number;
  totalFailed: number;
  errors: string[];
  scheduledSessions: Omit<ScheduleSession, 'id' | 'created_at' | 'updated_at'>[];
  unscheduledStudents: Student[];
  metrics: {
    totalTime: number;
    averageTimePerStudent: number;
    cacheHits: number;
    queryCount: number;
  };
}

export interface SchedulingCoordinatorConfig {
  engineConfig?: SchedulingEngineConfig;
  constraints?: Partial<SchedulingConstraints>;
  enableBatchOptimization?: boolean;
  enableProgressiveScheduling?: boolean;
}

export class SchedulingCoordinator {
  private supabase = createClient();
  private dataManager: SchedulingDataManager;
  private validator: ConstraintValidator;
  private distributor: SessionDistributor;
  private engine: SchedulingEngine;
  private context: SchedulingContext | null = null;
  
  private providerId: string = '';
  private providerRole: string = '';
  private schoolSite: string = '';
  
  private constraints: SchedulingConstraints = {
    maxConcurrentSessions: 6,
    maxConsecutiveMinutes: 60,
    minBreakMinutes: 30,
    schoolEndTime: '15:00',
    maxSessionsPerDay: 2,
    requireGradeGrouping: true
  };
  
  private performanceMetrics = {
    totalQueries: 0,
    cacheHits: 0,
    coordinationTime: 0,
    studentsProcessed: 0
  };

  constructor(config?: SchedulingCoordinatorConfig) {
    this.dataManager = SchedulingDataManager.getInstance();
    this.validator = new ConstraintValidator();
    this.distributor = new SessionDistributor();
    this.engine = new SchedulingEngine(config?.engineConfig);
    
    if (config?.constraints) {
      this.constraints = { ...this.constraints, ...config.constraints };
    }
  }

  /**
   * Initialize the coordinator with provider and school information
   */
  async initialize(providerId: string, providerRole: string, schoolSite: string, schoolId?: string): Promise<void> {
    const startTime = performance.now();
    
    this.providerId = providerId;
    this.providerRole = providerRole;
    this.schoolSite = schoolSite;
    
    console.log(`[Coordinator] Initializing for provider ${providerId} at ${schoolSite} (school_id: ${schoolId})`);
    
    // Initialize data manager if not already initialized
    if (!this.dataManager.isInitialized()) {
      // TODO: Get school_district from context if needed
      await this.dataManager.initialize(providerId, schoolSite, '', schoolId);
    }
    
    // Build context
    this.context = await this.buildSchedulingContext();
    
    const elapsed = performance.now() - startTime;
    this.performanceMetrics.coordinationTime += elapsed;
    
    console.log(`[Coordinator] Initialization complete in ${elapsed}ms`);
  }

  /**
   * Schedule a single student
   */
  async scheduleStudent(student: Student): Promise<SchedulingResult> {
    if (!this.context) {
      throw new Error('Coordinator not initialized. Call initialize() first.');
    }
    
    const startTime = performance.now();
    this.performanceMetrics.studentsProcessed++;
    
    console.log(`[Coordinator] Scheduling student ${student.initials}`);
    
    // Find available slots for the student
    const availableSlots = this.findAvailableSlots(student);
    
    if (availableSlots.length === 0) {
      return {
        success: false,
        scheduledSessions: [],
        unscheduledStudents: [student],
        errors: [`No available slots found for student ${student.initials}`]
      };
    }
    
    // Use engine to find optimal slots
    const result = this.engine.findOptimalSlots(
      student,
      availableSlots,
      this.constraints,
      this.context
    );
    
    // Add provider information to sessions
    result.scheduledSessions = result.scheduledSessions.map(session => ({
      ...session,
      provider_id: this.providerId,
      service_type: this.providerRole,
      assigned_to_sea_id: this.providerRole === 'sea' ? this.providerId : null,
      delivered_by: this.providerRole === 'sea' ? 'sea' as const : 'provider' as const
    }));
    
    // Update context if successful
    if (result.success) {
      this.updateContextWithSessions(result.scheduledSessions);
    }
    
    const elapsed = performance.now() - startTime;
    this.performanceMetrics.coordinationTime += elapsed;
    
    return result;
  }

  /**
   * Schedule multiple students in batch
   */
  async scheduleBatch(students: Student[]): Promise<BatchSchedulingResult> {
    if (!this.context) {
      throw new Error('Coordinator not initialized. Call initialize() first.');
    }
    
    const startTime = performance.now();
    console.log(`[Coordinator] Starting batch scheduling for ${students.length} students`);
    
    // Populate student grade map
    students.forEach(student => {
      this.context!.studentGradeMap.set(student.id, student.grade_level.trim());
    });
    
    // Optimize scheduling order
    const orderedStudents = this.engine.optimizeScheduleOrder(students);
    
    const result: BatchSchedulingResult = {
      totalScheduled: 0,
      totalFailed: 0,
      errors: [],
      scheduledSessions: [],
      unscheduledStudents: [],
      metrics: {
        totalTime: 0,
        averageTimePerStudent: 0,
        cacheHits: 0,
        queryCount: 0
      }
    };
    
    // Schedule each student
    for (const student of orderedStudents) {
      const schedulingResult = await this.scheduleStudent(student);
      
      if (schedulingResult.success) {
        result.totalScheduled++;
        result.scheduledSessions.push(...schedulingResult.scheduledSessions);
      } else {
        result.totalFailed++;
        result.unscheduledStudents.push(...schedulingResult.unscheduledStudents);
        result.errors.push(...schedulingResult.errors);
      }
    }
    
    // Save all sessions to database
    if (result.scheduledSessions.length > 0) {
      const { error } = await this.supabase
        .from('schedule_sessions')
        .insert(result.scheduledSessions);
      
      this.performanceMetrics.totalQueries++;
      
      if (error) {
        result.errors.push(`Failed to save sessions: ${error.message}`);
      }
    }
    
    // Calculate metrics
    const elapsed = performance.now() - startTime;
    result.metrics = {
      totalTime: elapsed,
      averageTimePerStudent: elapsed / students.length,
      cacheHits: this.performanceMetrics.cacheHits,
      queryCount: this.performanceMetrics.totalQueries
    };
    
    console.log(`[Coordinator] Batch scheduling complete:`);
    console.log(`  - Scheduled: ${result.totalScheduled}/${students.length}`);
    console.log(`  - Time: ${elapsed}ms`);
    console.log(`  - Avg per student: ${result.metrics.averageTimePerStudent}ms`);
    
    return result;
  }

  /**
   * Validate a specific time slot for a student
   */
  validateSlot(slot: TimeSlot, student: Student): ValidationResult {
    if (!this.context) {
      throw new Error('Coordinator not initialized. Call initialize() first.');
    }
    
    return this.validator.validateAllConstraints(slot, student, this.context);
  }

  /**
   * Find available slots for a student
   */
  findAvailableSlots(student: Student): TimeSlot[] {
    if (!this.context) {
      return [];
    }
    
    const availableSlots: TimeSlot[] = [];
    const duration = student.minutes_per_session;
    
    // Check each valid slot
    for (const [key, slot] of this.context.validSlots) {
      if (slot.capacity <= 0) continue;
      
      // Create a slot with proper end time
      const endTime = this.addMinutesToTime(slot.startTime, duration);
      const fullSlot: TimeSlot = {
        ...slot,
        endTime
      };
      
      // Validate the slot
      const validation = this.validateSlot(fullSlot, student);
      
      if (validation.isValid) {
        availableSlots.push(fullSlot);
      }
    }
    
    return availableSlots;
  }

  /**
   * Optimize distribution for a student
   */
  optimizeDistribution(student: Student, slots: TimeSlot[]): TimeSlot[] {
    if (!this.context) {
      return slots;
    }
    
    const distributionContext: DistributionContext = {
      student,
      availableSlots: slots,
      existingSessions: new Map(),
      studentGradeMap: this.context.studentGradeMap,
      targetGrade: student.grade_level.trim(),
      workDays: this.context.workDays
    };
    
    // Group existing sessions by student
    for (const session of this.context.existingSessions) {
      if (!distributionContext.existingSessions.has(session.student_id)) {
        distributionContext.existingSessions.set(session.student_id, []);
      }
      distributionContext.existingSessions.get(session.student_id)!.push(session);
    }
    
    const result = this.distributor.optimizeDistribution(
      student,
      slots,
      distributionContext
    );
    
    return result.slots;
  }

  /**
   * Build scheduling context from data manager
   */
  private async buildSchedulingContext(): Promise<SchedulingContext> {
    console.log('[Coordinator] Building scheduling context...');
    
    // Get data from data manager
    const workDays = this.dataManager.getProviderWorkDays(this.schoolSite);
    const existingSessions = this.dataManager.getExistingSessions();
    
    // Get bell schedules for all grades
    const bellSchedules: BellSchedule[] = [];
    const grades = ['K', 'TK', '1', '2', '3', '4', '5'];
    for (const grade of grades) {
      for (const day of [1, 2, 3, 4, 5]) {
        const conflicts = this.dataManager.getBellScheduleConflicts(
          grade,
          day,
          '00:00',
          '23:59'
        );
        bellSchedules.push(...conflicts);
      }
    }
    
    // Build indexed structures for O(1) lookups
    const bellSchedulesByGrade = new Map<string, Map<number, BellSchedule[]>>();
    for (const bell of bellSchedules) {
      const gradeList = bell.grade_level.split(',').map(g => g.trim());
      for (const grade of gradeList) {
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
    
    // Build provider availability map
    const providerAvailability = new Map<string, Map<number, AvailabilitySlot[]>>();
    const providerKey = `${this.providerId}-${this.schoolSite}`;
    providerAvailability.set(providerKey, new Map());
    
    for (const day of workDays) {
      const slots: AvailabilitySlot[] = [{
        dayOfWeek: day,
        startTime: '08:00',
        endTime: '15:00',
        schoolSite: this.schoolSite
      }];
      providerAvailability.get(providerKey)!.set(day, slots);
    }
    
    const context: SchedulingContext = {
      schoolSite: this.schoolSite,
      workDays,
      bellSchedules,
      specialActivities: [],
      existingSessions,
      validSlots: new Map(),
      schoolHours: [],
      studentGradeMap: new Map(),
      providerAvailability,
      bellSchedulesByGrade,
      specialActivitiesByTeacher: new Map(),
      cacheMetadata: {
        lastFetched: new Date(),
        isStale: false,
        fetchErrors: [],
        queryCount: 0
      }
    };
    
    // Build valid slots map
    this.buildValidSlotsMap(context);
    
    return context;
  }

  /**
   * Build map of valid time slots
   */
  private buildValidSlotsMap(context: SchedulingContext): void {
    console.log('[Coordinator] Building valid slots map...');
    
    const timeSlots = this.generateTimeSlots(8, 14);
    let totalSlots = 0;
    let validSlots = 0;
    
    for (const day of context.workDays) {
      for (const startTime of timeSlots) {
        totalSlots++;
        
        const slot: TimeSlot = {
          dayOfWeek: day,
          startTime,
          endTime: '',
          available: true,
          capacity: this.constraints.maxConcurrentSessions,
          conflicts: []
        };
        
        // Check existing sessions to determine current capacity
        const overlappingSessions = context.existingSessions.filter(session =>
          session.day_of_week === day &&
          this.timesOverlap(startTime, session.start_time, session.end_time)
        );
        
        slot.capacity -= overlappingSessions.length;
        
        if (slot.capacity > 0) {
          validSlots++;
          context.validSlots.set(`${day}-${startTime}`, slot);
        }
      }
    }
    
    console.log(`[Coordinator] Valid slots: ${validSlots}/${totalSlots}`);
  }

  /**
   * Update context after scheduling sessions
   */
  private updateContextWithSessions(
    sessions: Omit<ScheduleSession, 'id' | 'created_at' | 'updated_at'>[]
  ): void {
    if (!this.context) return;
    
    for (const session of sessions) {
      // Update capacity for affected slots
      const sessionStartMinutes = this.timeToMinutes(session.start_time);
      const sessionEndMinutes = this.timeToMinutes(session.end_time);
      
      for (const [key, slot] of this.context.validSlots) {
        if (slot.dayOfWeek === session.day_of_week) {
          const slotStartMinutes = this.timeToMinutes(slot.startTime);
          const slotEndMinutes = slotStartMinutes + 5;
          
          // Check overlap
          if (!(slotEndMinutes <= sessionStartMinutes || slotStartMinutes >= sessionEndMinutes)) {
            slot.capacity--;
            if (slot.capacity <= 0) {
              this.context.validSlots.delete(key);
            }
          }
        }
      }
      
      // Add to existing sessions
      this.context.existingSessions.push({
        id: `temp-${Math.random()}`,
        student_id: session.student_id,
        provider_id: session.provider_id,
        day_of_week: session.day_of_week,
        start_time: session.start_time,
        end_time: session.end_time,
        service_type: session.service_type,
        assigned_to_sea_id: session.assigned_to_sea_id,
        delivered_by: session.delivered_by,
        completed_at: session.completed_at,
        completed_by: session.completed_by,
        session_notes: session.session_notes,
        session_date: session.session_date,
        created_at: new Date().toISOString()
      });
    }
  }

  // Utility methods
  private generateTimeSlots(startHour: number, endHour: number): string[] {
    const slots: string[] = [];
    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        if (hour === endHour && minute > 30) break;
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  private timesOverlap(time: string, sessionStart: string, sessionEnd: string): boolean {
    const timeMin = this.timeToMinutes(time);
    const startMin = this.timeToMinutes(sessionStart);
    const endMin = this.timeToMinutes(sessionEnd);
    return timeMin >= startMin && timeMin < endMin;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const engineMetrics = this.engine.getMetrics();
    const validatorMetrics = this.validator.getMetrics();
    const distributorMetrics = this.distributor.getMetrics();
    
    return {
      coordinator: {
        ...this.performanceMetrics,
        averageCoordinationTime: this.performanceMetrics.studentsProcessed > 0
          ? this.performanceMetrics.coordinationTime / this.performanceMetrics.studentsProcessed
          : 0
      },
      engine: engineMetrics,
      validator: validatorMetrics,
      distributor: distributorMetrics
    };
  }
}