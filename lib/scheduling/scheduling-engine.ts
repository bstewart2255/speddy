import type { 
  TimeSlot, 
  SchedulingContext, 
  SchedulingConstraints,
  SchedulingResult 
} from './types/scheduling-types';
import type { Student, ScheduleSession } from './types/scheduling-data';
import type { DistributionStrategy, DistributionContext } from './types/distribution-strategy';
import { ConstraintValidator } from './constraint-validator';
import { SessionDistributor } from './session-distributor';

export interface SchedulingEngineConfig {
  maxRetries?: number;
  enableOptimization?: boolean;
  enableParallelProcessing?: boolean;
  priorityWeights?: {
    gradeGrouping: number;
    evenDistribution: number;
    timePreference: number;
    capacityUtilization: number;
  };
}

export class SchedulingEngine {
  private validator: ConstraintValidator;
  private distributor: SessionDistributor;
  private config: Required<SchedulingEngineConfig>;
  private performanceMetrics = {
    schedulingAttempts: 0,
    successfulSchedulings: 0,
    failedSchedulings: 0,
    totalSchedulingTime: 0,
    optimizationRuns: 0
  };

  constructor(config?: SchedulingEngineConfig) {
    this.validator = new ConstraintValidator();
    this.distributor = new SessionDistributor();
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      enableOptimization: config?.enableOptimization ?? true,
      enableParallelProcessing: config?.enableParallelProcessing ?? false,
      priorityWeights: {
        gradeGrouping: config?.priorityWeights?.gradeGrouping ?? 0.3,
        evenDistribution: config?.priorityWeights?.evenDistribution ?? 0.3,
        timePreference: config?.priorityWeights?.timePreference ?? 0.2,
        capacityUtilization: config?.priorityWeights?.capacityUtilization ?? 0.2
      }
    };
  }

  /**
   * Find optimal slots for a student
   */
  findOptimalSlots(
    student: Student,
    availableSlots: TimeSlot[],
    constraints: SchedulingConstraints,
    context: SchedulingContext
  ): SchedulingResult {
    const startTime = performance.now();
    this.performanceMetrics.schedulingAttempts++;

    const result: SchedulingResult = {
      success: false,
      scheduledSessions: [],
      unscheduledStudents: [],
      errors: []
    };

    try {
      // Filter slots by basic constraints
      const validSlots = this.filterSlotsByConstraints(
        student,
        availableSlots,
        constraints,
        context
      );

      // Calculate REMAINING sessions needed (not total sessions_per_week)
      const existingSessionsForStudent = context.existingSessions
        .filter(s => s.student_id === student.id).length;
      const sessionsNeeded = Math.max(0, (student.sessions_per_week || 0) - existingSessionsForStudent);
      
      if (validSlots.length < sessionsNeeded) {
        result.errors.push(
          `Only ${validSlots.length} valid slots available, need ${sessionsNeeded}`
        );
        result.unscheduledStudents.push(student);
        this.performanceMetrics.failedSchedulings++;
        return result;
      }

      // Determine distribution strategy
      const strategy = this.determineOptimalStrategy(student, validSlots, context);

      // Distribute sessions using selected strategy
      const distributedSlots = this.distributeSessions(
        sessionsNeeded,
        validSlots,
        strategy,
        context
      );

      // Optimize if enabled
      if (this.config.enableOptimization) {
        const optimizedSlots = this.optimizeSlotSelection(
          student,
          distributedSlots,
          context
        );
        result.scheduledSessions = this.createSessions(student, optimizedSlots);
      } else {
        result.scheduledSessions = this.createSessions(student, distributedSlots);
      }

      result.success = result.scheduledSessions.length === sessionsNeeded;
      if (result.success) {
        this.performanceMetrics.successfulSchedulings++;
      } else {
        this.performanceMetrics.failedSchedulings++;
      }

    } catch (error) {
      result.errors.push(`Scheduling engine error: ${error}`);
      result.unscheduledStudents.push(student);
      this.performanceMetrics.failedSchedulings++;
    } finally {
      const elapsed = performance.now() - startTime;
      this.performanceMetrics.totalSchedulingTime += elapsed;
    }

    return result;
  }

  /**
   * Distribute sessions based on strategy
   */
  distributeSessions(
    sessionsNeeded: number,
    availableSlots: TimeSlot[],
    strategy: DistributionStrategy,
    context: SchedulingContext
  ): TimeSlot[] {
    const distributionContext: DistributionContext = {
      student: {} as Student, // Will be passed from coordinator
      availableSlots,
      existingSessions: new Map(),
      studentGradeMap: context.studentGradeMap,
      targetGrade: '',
      workDays: context.workDays
    };

    switch (strategy) {
      case 'two-pass':
        return this.distributor.distributeTwoPass(sessionsNeeded, availableSlots);
      
      case 'grade-grouped':
        return this.distributor.distributeWithGradeGrouping(
          sessionsNeeded,
          availableSlots,
          distributionContext.targetGrade,
          context.studentGradeMap,
          context.existingSessions
        );
      
      case 'even':
        return this.distributor.distributeEvenly(sessionsNeeded, availableSlots);
      
      default:
        return availableSlots.slice(0, sessionsNeeded);
    }
  }

  /**
   * Optimize schedule order for batch processing
   */
  optimizeScheduleOrder(students: Student[]): Student[] {
    // Sort students by scheduling difficulty
    return [...students].sort((a, b) => {
      // Calculate difficulty score
      const difficultyA = this.calculateSchedulingDifficulty(a);
      const difficultyB = this.calculateSchedulingDifficulty(b);
      
      // Schedule harder students first
      return difficultyB - difficultyA;
    });
  }

  /**
   * Filter slots by constraints
   */
  private filterSlotsByConstraints(
    student: Student,
    slots: TimeSlot[],
    constraints: SchedulingConstraints,
    context: SchedulingContext
  ): TimeSlot[] {
    const validSlots: TimeSlot[] = [];

    for (const slot of slots) {
      // Quick capacity check
      if (slot.capacity <= 0) continue;

      // Validate all constraints
      const validationResult = this.validator.validateAllConstraints(
        slot,
        student,
        context
      );

      if (validationResult.isValid) {
        validSlots.push(slot);
      }
    }

    return validSlots;
  }

  /**
   * Determine optimal distribution strategy
   */
  private determineOptimalStrategy(
    student: Student,
    availableSlots: TimeSlot[],
    context: SchedulingContext
  ): DistributionStrategy {
    const sessions = student.sessions_per_week || 0;
    const minutes = student.minutes_per_session || 30;
    const totalMinutes = sessions * minutes;
    const slotsByDay = this.groupSlotsByDay(availableSlots);
    
    // Complex scheduling needs two-pass
    if (sessions > 3 || totalMinutes > 120) {
      return 'two-pass';
    }
    
    // Many students in same grade - use grouping
    const sameGradeCount = this.countStudentsInGrade(
      student.grade_level,
      context.studentGradeMap
    );
    
    if (sameGradeCount > 5) {
      return 'grade-grouped';
    }
    
    // Limited slots - use even distribution
    const avgSlotsPerDay = availableSlots.length / slotsByDay.size;
    if (avgSlotsPerDay < 5) {
      return 'even';
    }
    
    // Default to spread
    return 'spread';
  }

  /**
   * Optimize slot selection
   */
  private optimizeSlotSelection(
    student: Student,
    slots: TimeSlot[],
    context: SchedulingContext
  ): TimeSlot[] {
    this.performanceMetrics.optimizationRuns++;

    // Use the number of slots passed in (already filtered to correct count)
    const sessionsNeeded = slots.length;
    
    // Score each slot combination
    const scoredCombinations = this.generateSlotCombinations(
      slots,
      sessionsNeeded
    ).map(combination => ({
      slots: combination,
      score: this.scoreSlotCombination(combination, student, context)
    }));
    
    // Sort by score and return best combination
    scoredCombinations.sort((a, b) => b.score - a.score);
    
    return scoredCombinations[0]?.slots || slots;
  }

  /**
   * Generate slot combinations for optimization
   */
  private generateSlotCombinations(
    slots: TimeSlot[],
    sessionsNeeded: number
  ): TimeSlot[][] {
    const combinations: TimeSlot[][] = [];
    
    // Limit combinations to prevent performance issues
    const maxCombinations = 100;
    let combinationCount = 0;
    
    // Generate combinations using recursive approach
    const generate = (current: TimeSlot[], remaining: TimeSlot[], needed: number) => {
      if (needed === 0) {
        combinations.push([...current]);
        combinationCount++;
        return;
      }
      
      if (remaining.length === 0 || combinationCount >= maxCombinations) {
        return;
      }
      
      // Include first element
      generate(
        [...current, remaining[0]],
        remaining.slice(1),
        needed - 1
      );
      
      // Exclude first element
      generate(current, remaining.slice(1), needed);
    };
    
    generate([], slots, sessionsNeeded);
    
    return combinations;
  }

  /**
   * Score a combination of slots
   */
  private scoreSlotCombination(
    slots: TimeSlot[],
    student: Student,
    context: SchedulingContext
  ): number {
    let score = 0;
    
    // Grade grouping score
    const gradeScore = this.calculateGradeGroupingScore(slots, student, context);
    score += gradeScore * this.config.priorityWeights.gradeGrouping;
    
    // Distribution balance score
    const distributionScore = this.calculateDistributionScore(slots);
    score += distributionScore * this.config.priorityWeights.evenDistribution;
    
    // Time preference score
    const timeScore = this.calculateTimePreferenceScore(slots);
    score += timeScore * this.config.priorityWeights.timePreference;
    
    // Capacity utilization score
    const capacityScore = this.calculateCapacityScore(slots);
    score += capacityScore * this.config.priorityWeights.capacityUtilization;
    
    return score;
  }

  /**
   * Calculate grade grouping score
   */
  private calculateGradeGroupingScore(
    slots: TimeSlot[],
    student: Student,
    context: SchedulingContext
  ): number {
    let totalScore = 0;
    const targetGrade = student.grade_level.trim();

    // Defensive: ensure we only process scheduled sessions
    const scheduledSessions = context.existingSessions.filter(
      (s): s is typeof s & { start_time: string; end_time: string; day_of_week: number } =>
        s.start_time !== null && s.end_time !== null && s.day_of_week !== null
    );

    for (const slot of slots) {
      const overlappingSessions = scheduledSessions.filter(session =>
        session.day_of_week === slot.dayOfWeek &&
        this.hasTimeOverlap(
          slot.startTime,
          slot.endTime,
          session.start_time,
          session.end_time
        )
      );
      
      const sameGradeCount = overlappingSessions.filter(session => {
        if (!session.student_id) return false;
        const grade = context.studentGradeMap.get(session.student_id);
        return grade === targetGrade;
      }).length;
      
      if (overlappingSessions.length > 0) {
        totalScore += sameGradeCount / overlappingSessions.length;
      }
    }
    
    return slots.length > 0 ? totalScore / slots.length : 0;
  }

  /**
   * Calculate distribution balance score
   */
  private calculateDistributionScore(slots: TimeSlot[]): number {
    const slotsByDay = this.groupSlotsByDay(slots);
    const sessionCounts = Array.from(slotsByDay.values()).map(s => s.length);
    
    if (sessionCounts.length === 0) return 0;
    
    const avg = sessionCounts.reduce((a, b) => a + b, 0) / sessionCounts.length;
    const variance = sessionCounts.reduce((sum, count) => 
      sum + Math.pow(count - avg, 2), 0
    ) / sessionCounts.length;
    
    // Lower variance = better balance
    return Math.max(0, 1 - (variance / Math.max(1, avg)));
  }

  /**
   * Calculate time preference score
   */
  private calculateTimePreferenceScore(slots: TimeSlot[]): number {
    // Prefer morning slots for younger grades, afternoon for older
    let score = 0;
    
    for (const slot of slots) {
      const hour = parseInt(slot.startTime.split(':')[0]);
      
      // Morning preference (8-11)
      if (hour >= 8 && hour < 11) {
        score += 0.8;
      }
      // Mid-day (11-13)
      else if (hour >= 11 && hour < 13) {
        score += 1.0;
      }
      // Afternoon (13-15)
      else if (hour >= 13 && hour < 15) {
        score += 0.6;
      }
    }
    
    return slots.length > 0 ? score / slots.length : 0;
  }

  /**
   * Calculate capacity utilization score
   */
  private calculateCapacityScore(slots: TimeSlot[]): number {
    if (slots.length === 0) return 0;
    
    // Prefer slots with moderate capacity usage
    const avgCapacity = slots.reduce((sum, slot) => sum + slot.capacity, 0) / slots.length;
    
    // Optimal capacity is around 3-4 (not too empty, not too full)
    const optimalCapacity = 3.5;
    const deviation = Math.abs(avgCapacity - optimalCapacity);
    
    return Math.max(0, 1 - (deviation / optimalCapacity));
  }

  /**
   * Calculate scheduling difficulty for a student
   */
  private calculateSchedulingDifficulty(student: Student): number {
    let difficulty = 0;
    
    const sessions = student.sessions_per_week || 0;
    const minutes = student.minutes_per_session || 30;
    
    // More sessions = harder
    difficulty += sessions * 2;
    
    // Longer sessions = harder
    difficulty += minutes / 15;
    
    // Total minutes needed
    const totalMinutes = sessions * minutes;
    difficulty += totalMinutes / 30;
    
    // Special grades (K, TK) are harder
    if (['K', 'TK'].includes(student.grade_level)) {
      difficulty += 5;
    }
    
    return difficulty;
  }

  /**
   * Create session objects from slots
   */
  private createSessions(
    student: Student,
    slots: TimeSlot[]
  ): Omit<ScheduleSession, 'id' | 'created_at' | 'updated_at'>[] {
    return slots.map(slot => ({
      student_id: student.id,
      provider_id: '', // Will be set by coordinator
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
      service_type: '', // Will be set by coordinator
      assigned_to_sea_id: null,
      assigned_to_specialist_id: null,
      delivered_by: 'provider' as const,
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
      status: 'active' as const,
      has_conflict: false,
      conflict_reason: null
    }));
  }

  // Utility methods
  private groupSlotsByDay(slots: TimeSlot[]): Map<number, TimeSlot[]> {
    const grouped = new Map<number, TimeSlot[]>();
    
    for (const slot of slots) {
      if (!grouped.has(slot.dayOfWeek)) {
        grouped.set(slot.dayOfWeek, []);
      }
      grouped.get(slot.dayOfWeek)!.push(slot);
    }
    
    return grouped;
  }

  private countStudentsInGrade(
    grade: string,
    studentGradeMap: Map<string, string>
  ): number {
    let count = 0;
    for (const studentGrade of studentGradeMap.values()) {
      if (studentGrade === grade) count++;
    }
    return count;
  }

  private hasTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    const start1Min = this.timeToMinutes(start1);
    const end1Min = this.timeToMinutes(end1);
    const start2Min = this.timeToMinutes(start2);
    const end2Min = this.timeToMinutes(end2);
    return !(end1Min <= start2Min || start1Min >= end2Min);
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.performanceMetrics,
      successRate: this.performanceMetrics.schedulingAttempts > 0
        ? this.performanceMetrics.successfulSchedulings / this.performanceMetrics.schedulingAttempts
        : 0,
      averageSchedulingTime: this.performanceMetrics.schedulingAttempts > 0
        ? this.performanceMetrics.totalSchedulingTime / this.performanceMetrics.schedulingAttempts
        : 0
    };
  }
}