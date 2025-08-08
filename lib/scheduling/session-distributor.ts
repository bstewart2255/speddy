import type { TimeSlot, SchedulingContext } from './types/scheduling-types';
import type { Student, ScheduleSession } from './types/scheduling-data';
import type { 
  DistributionStrategy, 
  DistributionConfig, 
  DistributionResult,
  SlotScore,
  DistributionContext,
  DEFAULT_DISTRIBUTION_CONFIG
} from './types/distribution-strategy';

export class SessionDistributor {
  private config: DistributionConfig;
  private performanceMetrics = {
    distributionCount: 0,
    totalDistributionTime: 0,
    gradeGroupingAttempts: 0,
    twoPassDistributions: 0
  };

  constructor(config?: Partial<DistributionConfig>) {
    this.config = {
      strategy: config?.strategy || 'two-pass',
      maxSessionsPerSlot: config?.maxSessionsPerSlot || 6,
      maxSessionsPerDay: config?.maxSessionsPerDay || 2,
      preferMorning: config?.preferMorning || false,
      preferAfternoon: config?.preferAfternoon || false,
      gradeGroupingEnabled: config?.gradeGroupingEnabled !== false,
      twoPassEnabled: config?.twoPassEnabled !== false,
      firstPassLimit: config?.firstPassLimit || 3,
      secondPassLimit: config?.secondPassLimit || 6
    };
  }

  /**
   * Distribute sessions evenly across available days
   */
  distributeEvenly(
    sessionsNeeded: number,
    availableSlots: TimeSlot[]
  ): TimeSlot[] {
    const startTime = performance.now();
    const result: TimeSlot[] = [];
    
    // Group slots by day
    const slotsByDay = this.groupSlotsByDay(availableSlots);
    
    // Sort days by current load (ascending)
    const sortedDays = Array.from(slotsByDay.keys()).sort((a, b) => {
      const aSlots = slotsByDay.get(a)?.length || 0;
      const bSlots = slotsByDay.get(b)?.length || 0;
      return aSlots - bSlots;
    });
    
    // Distribute sessions round-robin across days
    let dayIndex = 0;
    let sessionsScheduled = 0;
    
    while (sessionsScheduled < sessionsNeeded && this.hasAvailableSlots(slotsByDay)) {
      const day = sortedDays[dayIndex % sortedDays.length];
      const daySlots = slotsByDay.get(day) || [];
      
      if (daySlots.length > 0) {
        const slot = daySlots.shift();
        if (slot) {
          result.push(slot);
          sessionsScheduled++;
        }
      }
      
      dayIndex++;
    }
    
    this.updateMetrics(performance.now() - startTime);
    return result;
  }

  /**
   * Distribute with grade grouping optimization
   */
  distributeWithGradeGrouping(
    sessionsNeeded: number,
    availableSlots: TimeSlot[],
    targetGrade: string,
    studentGradeMap: Map<string, string>,
    existingSessions: ScheduleSession[]
  ): TimeSlot[] {
    const startTime = performance.now();
    this.performanceMetrics.gradeGroupingAttempts++;
    
    // Score each slot based on grade alignment
    const scoredSlots = this.scoreSlotsByGradeAlignment(
      availableSlots,
      targetGrade,
      studentGradeMap,
      existingSessions
    );
    
    // Sort by score (descending) and select top slots
    scoredSlots.sort((a, b) => b.score - a.score);
    
    const result = scoredSlots
      .slice(0, sessionsNeeded)
      .map(scored => scored.slot);
    
    this.updateMetrics(performance.now() - startTime);
    return result;
  }

  /**
   * Two-pass distribution strategy
   */
  distributeTwoPass(
    sessionsNeeded: number,
    availableSlots: TimeSlot[],
    maxFirstPass: number = 3
  ): TimeSlot[] {
    const startTime = performance.now();
    this.performanceMetrics.twoPassDistributions++;
    
    const result: TimeSlot[] = [];
    const remainingSlots = [...availableSlots];
    
    // First pass: Distribute with lower capacity limit
    const firstPassSlots = this.findSlotsWithCapacityLimit(
      remainingSlots,
      Math.min(sessionsNeeded, remainingSlots.length),
      maxFirstPass
    );
    
    result.push(...firstPassSlots);
    
    // Remove used slots from remaining
    for (const usedSlot of firstPassSlots) {
      const index = remainingSlots.findIndex(s => 
        s.dayOfWeek === usedSlot.dayOfWeek && 
        s.startTime === usedSlot.startTime
      );
      if (index >= 0) {
        remainingSlots.splice(index, 1);
      }
    }
    
    // Second pass: If we need more slots, use higher capacity limit
    if (result.length < sessionsNeeded) {
      const secondPassSlots = this.findSlotsWithCapacityLimit(
        remainingSlots,
        sessionsNeeded - result.length,
        this.config.secondPassLimit || 10
      );
      result.push(...secondPassSlots);
    }
    
    this.updateMetrics(performance.now() - startTime);
    return result;
  }

  /**
   * Sort slots with grade preference (extracted from OptimizedScheduler)
   */
  sortSlotsWithGradePreference(
    slots: TimeSlot[],
    day: number,
    targetGrade: string,
    context: SchedulingContext
  ): TimeSlot[] {
    // Calculate scores for each slot
    const slotsWithScores = slots.map(slot => {
      const overlappingSessions = context.existingSessions.filter(
        session =>
          session.day_of_week === day &&
          this.hasTimeOverlap(
            slot.startTime,
            this.addMinutesToTime(slot.startTime, 30),
            session.start_time,
            session.end_time
          )
      );
      
      let sameGradeCount = 0;
      let otherGradeCount = 0;
      
      for (const session of overlappingSessions) {
        const sessionGrade = context.studentGradeMap.get(session.student_id);
        if (sessionGrade === targetGrade) {
          sameGradeCount++;
        } else if (sessionGrade) {
          otherGradeCount++;
        }
      }
      
      return {
        slot,
        sameGradeCount,
        otherGradeCount,
        totalSessions: overlappingSessions.length
      };
    });
    
    // Sort by: even distribution first, then grade grouping, then time
    return slotsWithScores
      .sort((a, b) => {
        // Priority 1: Even distribution
        if (a.totalSessions !== b.totalSessions) {
          return a.totalSessions - b.totalSessions;
        }
        
        // Priority 2: Grade grouping
        if (a.sameGradeCount !== b.sameGradeCount) {
          return b.sameGradeCount - a.sameGradeCount;
        }
        
        // Priority 3: Time order
        return this.timeToMinutes(a.slot.startTime) - this.timeToMinutes(b.slot.startTime);
      })
      .map(item => item.slot);
  }

  /**
   * Find slots with specific capacity limit
   */
  findSlotsWithCapacityLimit(
    availableSlots: TimeSlot[],
    sessionsNeeded: number,
    capacityLimit: number
  ): TimeSlot[] {
    const result: TimeSlot[] = [];
    
    for (const slot of availableSlots) {
      if (result.length >= sessionsNeeded) break;
      
      // Check if slot is under capacity limit
      if (slot.capacity > 0 && slot.capacity <= capacityLimit) {
        result.push(slot);
      }
    }
    
    return result;
  }

  /**
   * Get distribution strategy for a student
   */
  getDistributionStrategy(
    student: Student,
    availableSlots: TimeSlot[]
  ): DistributionStrategy {
    // Determine strategy based on student needs and available slots
    const totalMinutesNeeded = student.sessions_per_week * student.minutes_per_session;
    const slotsByDay = this.groupSlotsByDay(availableSlots);
    const avgSlotsPerDay = availableSlots.length / slotsByDay.size;
    
    // Use two-pass for complex cases
    if (student.sessions_per_week > 3 || totalMinutesNeeded > 120) {
      return 'two-pass';
    }
    
    // Use grade-grouped if many students in same grade
    if (this.config.gradeGroupingEnabled) {
      return 'grade-grouped';
    }
    
    // Use even distribution if slots are limited
    if (avgSlotsPerDay < 5) {
      return 'even';
    }
    
    // Default to spread
    return 'spread';
  }

  /**
   * Optimize distribution for a student
   */
  optimizeDistribution(
    student: Student,
    availableSlots: TimeSlot[],
    context: DistributionContext
  ): DistributionResult {
    const strategy = this.getDistributionStrategy(student, availableSlots);
    let distributedSlots: TimeSlot[] = [];
    
    switch (strategy) {
      case 'two-pass':
        distributedSlots = this.distributeTwoPass(
          student.sessions_per_week,
          availableSlots,
          this.config.firstPassLimit
        );
        break;
        
      case 'grade-grouped':
        distributedSlots = this.distributeWithGradeGrouping(
          student.sessions_per_week,
          availableSlots,
          context.targetGrade,
          context.studentGradeMap,
          Array.from(context.existingSessions.values()).flat()
        );
        break;
        
      case 'even':
        distributedSlots = this.distributeEvenly(
          student.sessions_per_week,
          availableSlots
        );
        break;
        
      case 'compact':
        distributedSlots = this.distributeCompact(
          student.sessions_per_week,
          availableSlots
        );
        break;
        
      case 'spread':
      default:
        distributedSlots = this.distributeSpread(
          student.sessions_per_week,
          availableSlots
        );
        break;
    }
    
    // Calculate metrics
    const distribution = this.groupSlotsByDay(distributedSlots);
    const sessionCounts = Array.from(distribution.values()).map(slots => slots.length);
    
    return {
      slots: distributedSlots,
      distribution,
      metrics: {
        averageSessionsPerDay: sessionCounts.reduce((a, b) => a + b, 0) / sessionCounts.length,
        maxSessionsOnAnyDay: Math.max(...sessionCounts),
        distributionBalance: this.calculateBalance(sessionCounts),
        gradeGroupingScore: this.calculateGradeGroupingScore(
          distributedSlots,
          context.targetGrade,
          context.studentGradeMap,
          Array.from(context.existingSessions.values()).flat()
        )
      }
    };
  }

  /**
   * Distribute sessions to maximize gaps (spread strategy)
   */
  private distributeSpread(
    sessionsNeeded: number,
    availableSlots: TimeSlot[]
  ): TimeSlot[] {
    const result: TimeSlot[] = [];
    const slotsByDay = this.groupSlotsByDay(availableSlots);
    
    // Select slots with maximum time gaps
    for (const [day, daySlots] of slotsByDay) {
      if (result.length >= sessionsNeeded) break;
      
      // Sort by time
      daySlots.sort((a, b) => 
        this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime)
      );
      
      // Pick slots with maximum gaps
      if (daySlots.length > 0) {
        result.push(daySlots[0]); // First slot of the day
        if (result.length < sessionsNeeded && daySlots.length > 1) {
          result.push(daySlots[daySlots.length - 1]); // Last slot
        }
      }
    }
    
    return result.slice(0, sessionsNeeded);
  }

  /**
   * Distribute sessions close together (compact strategy)
   */
  private distributeCompact(
    sessionsNeeded: number,
    availableSlots: TimeSlot[]
  ): TimeSlot[] {
    const result: TimeSlot[] = [];
    
    // Sort all slots by day and time
    const sortedSlots = [...availableSlots].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }
      return this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime);
    });
    
    // Select consecutive slots
    for (const slot of sortedSlots) {
      if (result.length >= sessionsNeeded) break;
      
      // If no slots yet, or slot is close to last one
      if (result.length === 0) {
        result.push(slot);
      } else {
        const lastSlot = result[result.length - 1];
        const timeDiff = this.timeToMinutes(slot.startTime) - 
                        this.timeToMinutes(lastSlot.endTime);
        
        // Accept if on same day and within 60 minutes
        if (lastSlot.dayOfWeek === slot.dayOfWeek && timeDiff <= 60) {
          result.push(slot);
        }
      }
    }
    
    // Fill remaining from sorted list if needed
    if (result.length < sessionsNeeded) {
      for (const slot of sortedSlots) {
        if (!result.includes(slot)) {
          result.push(slot);
          if (result.length >= sessionsNeeded) break;
        }
      }
    }
    
    return result;
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

  private hasAvailableSlots(slotsByDay: Map<number, TimeSlot[]>): boolean {
    for (const slots of slotsByDay.values()) {
      if (slots.length > 0) return true;
    }
    return false;
  }

  private scoreSlotsByGradeAlignment(
    slots: TimeSlot[],
    targetGrade: string,
    studentGradeMap: Map<string, string>,
    existingSessions: ScheduleSession[]
  ): SlotScore[] {
    return slots.map(slot => {
      let gradeAlignment = 0;
      
      // Check existing sessions in this slot
      const overlappingSessions = existingSessions.filter(session =>
        session.day_of_week === slot.dayOfWeek &&
        this.hasTimeOverlap(
          slot.startTime,
          slot.endTime,
          session.start_time,
          session.end_time
        )
      );
      
      for (const session of overlappingSessions) {
        const sessionGrade = studentGradeMap.get(session.student_id);
        if (sessionGrade === targetGrade) {
          gradeAlignment += 2; // Bonus for same grade
        } else if (sessionGrade && this.areGradesAdjacent(targetGrade, sessionGrade)) {
          gradeAlignment += 1; // Small bonus for adjacent grades
        }
      }
      
      // Calculate overall score
      const capacityScore = slot.capacity / this.config.maxSessionsPerSlot;
      const timePreferenceScore = this.calculateTimePreference(slot.startTime);
      
      return {
        slot,
        score: gradeAlignment * 0.4 + capacityScore * 0.3 + timePreferenceScore * 0.3,
        factors: {
          capacity: capacityScore,
          gradeAlignment: gradeAlignment / Math.max(1, overlappingSessions.length),
          timePreference: timePreferenceScore,
          distribution: 0 // Will be calculated based on context
        }
      };
    });
  }

  private areGradesAdjacent(grade1: string, grade2: string): boolean {
    const gradeOrder = ['TK', 'K', '1', '2', '3', '4', '5'];
    const index1 = gradeOrder.indexOf(grade1);
    const index2 = gradeOrder.indexOf(grade2);
    
    if (index1 === -1 || index2 === -1) return false;
    return Math.abs(index1 - index2) === 1;
  }

  private calculateTimePreference(startTime: string): number {
    const hour = parseInt(startTime.split(':')[0]);
    
    if (this.config.preferMorning && hour < 12) {
      return 1.0;
    } else if (this.config.preferAfternoon && hour >= 12) {
      return 1.0;
    }
    
    // No preference - neutral score
    return 0.5;
  }

  private calculateBalance(sessionCounts: number[]): number {
    if (sessionCounts.length === 0) return 0;
    
    const avg = sessionCounts.reduce((a, b) => a + b, 0) / sessionCounts.length;
    const variance = sessionCounts.reduce((sum, count) => 
      sum + Math.pow(count - avg, 2), 0
    ) / sessionCounts.length;
    
    // Convert variance to 0-1 score (lower variance = better balance)
    return Math.max(0, 1 - (variance / avg));
  }

  private calculateGradeGroupingScore(
    slots: TimeSlot[],
    targetGrade: string,
    studentGradeMap: Map<string, string>,
    existingSessions: ScheduleSession[]
  ): number {
    let totalScore = 0;
    let slotCount = 0;
    
    for (const slot of slots) {
      const overlappingSessions = existingSessions.filter(session =>
        session.day_of_week === slot.dayOfWeek &&
        this.hasTimeOverlap(
          slot.startTime,
          slot.endTime,
          session.start_time,
          session.end_time
        )
      );
      
      if (overlappingSessions.length > 0) {
        const sameGradeCount = overlappingSessions.filter(session => {
          const grade = studentGradeMap.get(session.student_id);
          return grade === targetGrade;
        }).length;
        
        totalScore += sameGradeCount / overlappingSessions.length;
        slotCount++;
      }
    }
    
    return slotCount > 0 ? totalScore / slotCount : 0;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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

  private updateMetrics(elapsedTime: number) {
    this.performanceMetrics.distributionCount++;
    this.performanceMetrics.totalDistributionTime += elapsedTime;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.performanceMetrics,
      averageDistributionTime: this.performanceMetrics.distributionCount > 0
        ? this.performanceMetrics.totalDistributionTime / this.performanceMetrics.distributionCount
        : 0
    };
  }
}