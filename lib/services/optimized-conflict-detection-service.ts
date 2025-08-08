import { BellSchedule, SpecialActivity, ScheduleSession } from '@/src/types/database';

interface Student {
  id: string;
  grade_level: string;
  teacher_name: string | null;
  minutes_per_session: number;
}

interface SchoolHours {
  grade_level: string;
  start_time: string;
  end_time: string;
}

interface CachedScheduleData {
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  existingSessions: ScheduleSession[];
  schoolHours: SchoolHours[];
  students: Student[];
  isLoaded: boolean;
  lastUpdated: number;
}

interface PreProcessedData {
  // Maps for O(1) lookups
  bellScheduleBySlot: Map<string, BellSchedule[]>;
  specialActivityBySlot: Map<string, SpecialActivity[]>;
  sessionsBySlot: Map<string, ScheduleSession[]>;
  sessionsByStudent: Map<string, ScheduleSession[]>;
  schoolHoursByGrade: Map<string, SchoolHours>;
  capacityBySlot: Map<string, number>;
}

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const timeRangesOverlap = (
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean => {
  return start1 < end2 && end1 > start2;
};

export class OptimizedConflictDetectionService {
  private cachedData: CachedScheduleData = {
    bellSchedules: [],
    specialActivities: [],
    existingSessions: [],
    schoolHours: [],
    students: [],
    isLoaded: false,
    lastUpdated: 0
  };

  private processedData: PreProcessedData | null = null;
  
  private readonly GRID_START_HOUR = 7;
  private readonly GRID_END_HOUR = 18;
  private readonly SNAP_INTERVAL = 15;
  private readonly MAX_CONCURRENT_SESSIONS = 6;
  private readonly MAX_CONSECUTIVE_MINUTES = 60;
  private readonly MIN_BREAK_MINUTES = 30;
  private readonly CACHE_DURATION_MS = 60000; // 1 minute cache

  /**
   * Load and cache all schedule data when the page loads
   * This should be called ONCE when the schedule page mounts
   */
  async loadAndCacheData(data: {
    bellSchedules: BellSchedule[];
    specialActivities: SpecialActivity[];
    existingSessions: ScheduleSession[];
    schoolHours: SchoolHours[];
    students: Student[];
  }): Promise<void> {
    console.time('[OptimizedConflict] Loading and processing data');
    
    // Store raw data
    this.cachedData = {
      ...data,
      isLoaded: true,
      lastUpdated: Date.now()
    };

    // Pre-process data into efficient lookup structures
    this.processedData = this.preprocessData(data);
    
    console.timeEnd('[OptimizedConflict] Loading and processing data');
    console.log('[OptimizedConflict] Data cached:', {
      bellSchedules: data.bellSchedules.length,
      specialActivities: data.specialActivities.length,
      sessions: data.existingSessions.length,
      students: data.students.length,
      schoolHours: data.schoolHours.length,
      processedSlots: this.processedData.bellScheduleBySlot.size + 
                      this.processedData.specialActivityBySlot.size
    });
  }

  /**
   * Pre-process data into efficient lookup structures
   */
  private preprocessData(data: {
    bellSchedules: BellSchedule[];
    specialActivities: SpecialActivity[];
    existingSessions: ScheduleSession[];
    schoolHours: SchoolHours[];
  }): PreProcessedData {
    const bellScheduleBySlot = new Map<string, BellSchedule[]>();
    const specialActivityBySlot = new Map<string, SpecialActivity[]>();
    const sessionsBySlot = new Map<string, ScheduleSession[]>();
    const sessionsByStudent = new Map<string, ScheduleSession[]>();
    const schoolHoursByGrade = new Map<string, SchoolHours>();
    const capacityBySlot = new Map<string, number>();

    // Process school hours
    for (const sh of data.schoolHours) {
      schoolHoursByGrade.set(sh.grade_level, sh);
    }

    // Process bell schedules - create slot entries for each affected time
    for (const bell of data.bellSchedules) {
      const startMin = timeToMinutes(bell.start_time);
      const endMin = timeToMinutes(bell.end_time);
      
      // Add to all affected time slots
      for (let day = 1; day <= 5; day++) {
        if (bell.day_of_week === day) {
          for (let min = startMin; min < endMin; min += this.SNAP_INTERVAL) {
            const timeStr = minutesToTime(min);
            const slotKey = `${day}-${timeStr}`;
            
            if (!bellScheduleBySlot.has(slotKey)) {
              bellScheduleBySlot.set(slotKey, []);
            }
            bellScheduleBySlot.get(slotKey)!.push(bell);
          }
        }
      }
    }

    // Process special activities
    for (const activity of data.specialActivities) {
      const startMin = timeToMinutes(activity.start_time);
      const endMin = timeToMinutes(activity.end_time);
      
      for (let min = startMin; min < endMin; min += this.SNAP_INTERVAL) {
        const timeStr = minutesToTime(min);
        const slotKey = `${activity.day_of_week}-${timeStr}`;
        
        if (!specialActivityBySlot.has(slotKey)) {
          specialActivityBySlot.set(slotKey, []);
        }
        specialActivityBySlot.get(slotKey)!.push(activity);
      }
    }

    // Process existing sessions
    for (const session of data.existingSessions) {
      const startMin = timeToMinutes(session.start_time);
      const endMin = timeToMinutes(session.end_time);
      
      // Add to student map
      if (!sessionsByStudent.has(session.student_id)) {
        sessionsByStudent.set(session.student_id, []);
      }
      sessionsByStudent.get(session.student_id)!.push(session);
      
      // Add to slot maps
      for (let min = startMin; min < endMin; min += this.SNAP_INTERVAL) {
        const timeStr = minutesToTime(min);
        const slotKey = `${session.day_of_week}-${timeStr}`;
        
        // Sessions by slot
        if (!sessionsBySlot.has(slotKey)) {
          sessionsBySlot.set(slotKey, []);
        }
        sessionsBySlot.get(slotKey)!.push(session);
        
        // Capacity tracking
        const currentCapacity = capacityBySlot.get(slotKey) || 0;
        capacityBySlot.set(slotKey, currentCapacity + 1);
      }
    }

    return {
      bellScheduleBySlot,
      specialActivityBySlot,
      sessionsBySlot,
      sessionsByStudent,
      schoolHoursByGrade,
      capacityBySlot
    };
  }

  /**
   * Calculate conflicts for a dragged session - INSTANT, no async
   * This should complete in < 50ms for the entire week
   */
  calculateConflictsInstant(
    draggedSessionId: string,
    studentId: string,
    studentGradeLevel: string,
    studentTeacherName: string | null,
    studentMinutesPerSession: number
  ): Set<string> {
    if (!this.cachedData.isLoaded || !this.processedData) {
      console.warn('[OptimizedConflict] Data not loaded, returning empty conflicts');
      return new Set();
    }

    const startTime = performance.now();
    const conflicts = new Set<string>();
    let checksPerformed = 0;
    const conflictReasons = new Map<string, string[]>();
    
    // Get current session info to skip its current position
    const currentSession = this.cachedData.existingSessions.find(s => s.id === draggedSessionId);
    const skipSlot = currentSession 
      ? `${currentSession.day_of_week}-${currentSession.start_time.substring(0, 5)}`
      : null;

    // Get student's existing sessions for consecutive/break checks
    const studentSessions = this.processedData.sessionsByStudent.get(studentId) || [];
    const studentSessionsByDay = new Map<number, ScheduleSession[]>();
    for (const session of studentSessions) {
      if (session.id !== draggedSessionId) {
        if (!studentSessionsByDay.has(session.day_of_week)) {
          studentSessionsByDay.set(session.day_of_week, []);
        }
        studentSessionsByDay.get(session.day_of_week)!.push(session);
      }
    }

    // Sort sessions by start time for each day
    for (const [day, sessions] of studentSessionsByDay) {
      sessions.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    }

    // Get school hours for student's grade
    const schoolHours = this.processedData.schoolHoursByGrade.get(studentGradeLevel);
    const schoolStartMin = schoolHours ? timeToMinutes(schoolHours.start_time) : 0;
    const schoolEndMin = schoolHours ? timeToMinutes(schoolHours.end_time) : 24 * 60;

    // Check each possible slot in the week
    for (let day = 1; day <= 5; day++) {
      const daySessions = studentSessionsByDay.get(day) || [];
      
      for (let hour = this.GRID_START_HOUR; hour < this.GRID_END_HOUR; hour++) {
        for (let minute = 0; minute < 60; minute += this.SNAP_INTERVAL) {
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          const slotKey = `${day}-${timeStr}`;
          
          // Skip current session position
          if (slotKey === skipSlot) {
            continue;
          }

          checksPerformed++;
          const startMin = hour * 60 + minute;
          const endMin = startMin + studentMinutesPerSession;
          const reasons: string[] = [];

          // Check if session would exceed grid bounds
          if (endMin > this.GRID_END_HOUR * 60) {
            reasons.push('exceeds_grid');
            conflicts.add(slotKey);
            conflictReasons.set(slotKey, reasons);
            continue;
          }

          // Check school hours
          if (schoolHours && (startMin < schoolStartMin || endMin > schoolEndMin)) {
            reasons.push('outside_school_hours');
            conflicts.add(slotKey);
            conflictReasons.set(slotKey, reasons);
            continue;
          }

          // Check bell schedule conflicts
          const bellConflicts = this.checkBellScheduleConflict(
            day, timeStr, studentMinutesPerSession, studentGradeLevel
          );
          if (bellConflicts) {
            reasons.push('bell_schedule');
            conflicts.add(slotKey);
            conflictReasons.set(slotKey, reasons);
            continue;
          }

          // Check special activity conflicts
          const activityConflicts = this.checkSpecialActivityConflict(
            day, timeStr, studentMinutesPerSession, studentTeacherName
          );
          if (activityConflicts) {
            reasons.push('special_activity');
            conflicts.add(slotKey);
            conflictReasons.set(slotKey, reasons);
            continue;
          }

          // Check student's own session overlaps
          const studentOverlap = this.checkStudentOverlap(
            day, startMin, endMin, studentId, draggedSessionId
          );
          if (studentOverlap) {
            reasons.push('student_overlap');
            conflicts.add(slotKey);
            conflictReasons.set(slotKey, reasons);
            continue;
          }

          // Check capacity
          const capacityExceeded = this.checkCapacityExceeded(
            day, timeStr, studentMinutesPerSession
          );
          if (capacityExceeded) {
            reasons.push('capacity_exceeded');
            conflicts.add(slotKey);
            conflictReasons.set(slotKey, reasons);
            continue;
          }

          // Check consecutive session and break rules
          const ruleViolation = this.checkConsecutiveAndBreakRules(
            daySessions, startMin, endMin, studentMinutesPerSession
          );
          if (ruleViolation) {
            reasons.push('rule_violation');
            conflicts.add(slotKey);
            conflictReasons.set(slotKey, reasons);
            continue;
          }
        }
      }
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log detailed performance metrics
    console.log(`[OptimizedConflict] Performance Report:`, {
      duration: `${duration.toFixed(2)}ms`,
      totalChecks: checksPerformed,
      conflictsFound: conflicts.size,
      checksPerMs: (checksPerformed / duration).toFixed(1),
      conflictsByDay: [1, 2, 3, 4, 5].map(d => ({
        day: d,
        conflicts: Array.from(conflicts).filter(c => c.startsWith(`${d}-`)).length
      })),
      conflictTypes: {
        bell: Array.from(conflictReasons.values()).filter(r => r.includes('bell_schedule')).length,
        activity: Array.from(conflictReasons.values()).filter(r => r.includes('special_activity')).length,
        overlap: Array.from(conflictReasons.values()).filter(r => r.includes('student_overlap')).length,
        capacity: Array.from(conflictReasons.values()).filter(r => r.includes('capacity_exceeded')).length,
        rules: Array.from(conflictReasons.values()).filter(r => r.includes('rule_violation')).length,
        schoolHours: Array.from(conflictReasons.values()).filter(r => r.includes('outside_school_hours')).length,
        gridBounds: Array.from(conflictReasons.values()).filter(r => r.includes('exceeds_grid')).length
      }
    });
    
    if (duration > 100) {
      console.warn('[OptimizedConflict] Performance warning: calculation took > 100ms');
    } else if (duration < 50) {
      console.log('[OptimizedConflict] ✅ Excellent performance! Under 50ms');
    }

    return conflicts;
  }

  private checkBellScheduleConflict(
    day: number,
    timeStr: string,
    duration: number,
    studentGrade: string
  ): boolean {
    if (!this.processedData) return false;

    const startMin = timeToMinutes(timeStr);
    const endMin = startMin + duration;
    
    // Check all slots that the session would occupy
    for (let min = startMin; min < endMin; min += this.SNAP_INTERVAL) {
      const checkTime = minutesToTime(min);
      const slotKey = `${day}-${checkTime}`;
      const bellSchedules = this.processedData.bellScheduleBySlot.get(slotKey) || [];
      
      for (const bell of bellSchedules) {
        const grades = bell.grade_level.split(',').map(g => g.trim());
        if (grades.includes(studentGrade.trim())) {
          return true;
        }
      }
    }
    
    return false;
  }

  private checkSpecialActivityConflict(
    day: number,
    timeStr: string,
    duration: number,
    teacherName: string | null
  ): boolean {
    if (!this.processedData || !teacherName) return false;

    const startMin = timeToMinutes(timeStr);
    const endMin = startMin + duration;
    
    for (let min = startMin; min < endMin; min += this.SNAP_INTERVAL) {
      const checkTime = minutesToTime(min);
      const slotKey = `${day}-${checkTime}`;
      const activities = this.processedData.specialActivityBySlot.get(slotKey) || [];
      
      for (const activity of activities) {
        if (activity.teacher_name === teacherName) {
          return true;
        }
      }
    }
    
    return false;
  }

  private checkStudentOverlap(
    day: number,
    startMin: number,
    endMin: number,
    studentId: string,
    excludeSessionId: string
  ): boolean {
    if (!this.processedData) return false;

    const studentSessions = this.processedData.sessionsByStudent.get(studentId) || [];
    
    for (const session of studentSessions) {
      if (session.id === excludeSessionId) continue;
      if (session.day_of_week !== day) continue;
      
      const sessionStart = timeToMinutes(session.start_time);
      const sessionEnd = timeToMinutes(session.end_time);
      
      if (timeRangesOverlap(startMin, endMin, sessionStart, sessionEnd)) {
        return true;
      }
    }
    
    return false;
  }

  private checkCapacityExceeded(
    day: number,
    timeStr: string,
    duration: number
  ): boolean {
    if (!this.processedData) return false;

    const startMin = timeToMinutes(timeStr);
    const endMin = startMin + duration;
    
    for (let min = startMin; min < endMin; min += this.SNAP_INTERVAL) {
      const checkTime = minutesToTime(min);
      const slotKey = `${day}-${checkTime}`;
      const capacity = this.processedData.capacityBySlot.get(slotKey) || 0;
      
      if (capacity >= this.MAX_CONCURRENT_SESSIONS) {
        return true;
      }
    }
    
    return false;
  }

  private checkConsecutiveAndBreakRules(
    daySessions: ScheduleSession[],
    startMin: number,
    endMin: number,
    sessionDuration: number
  ): boolean {
    for (const existingSession of daySessions) {
      const existingStart = timeToMinutes(existingSession.start_time);
      const existingEnd = timeToMinutes(existingSession.end_time);
      const existingDuration = existingEnd - existingStart;
      
      // Check consecutive sessions
      if (existingEnd === startMin || endMin === existingStart) {
        const totalConsecutive = sessionDuration + existingDuration;
        if (totalConsecutive > this.MAX_CONSECUTIVE_MINUTES) {
          return true;
        }
      }
      
      // Check break requirements
      const gapBefore = startMin - existingEnd;
      const gapAfter = existingStart - endMin;
      
      if ((gapBefore > 0 && gapBefore < this.MIN_BREAK_MINUTES) ||
          (gapAfter > 0 && gapAfter < this.MIN_BREAK_MINUTES)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if data needs to be refreshed
   */
  isDataStale(): boolean {
    if (!this.cachedData.isLoaded) return true;
    const age = Date.now() - this.cachedData.lastUpdated;
    return age > this.CACHE_DURATION_MS;
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cachedData = {
      bellSchedules: [],
      specialActivities: [],
      existingSessions: [],
      schoolHours: [],
      students: [],
      isLoaded: false,
      lastUpdated: 0
    };
    this.processedData = null;
    console.log('[OptimizedConflict] Cache cleared');
  }

  /**
   * Get cache status
   */
  getCacheStatus(): {
    isLoaded: boolean;
    dataAge: number;
    itemCounts: {
      bellSchedules: number;
      specialActivities: number;
      sessions: number;
      students: number;
    };
  } {
    return {
      isLoaded: this.cachedData.isLoaded,
      dataAge: Date.now() - this.cachedData.lastUpdated,
      itemCounts: {
        bellSchedules: this.cachedData.bellSchedules.length,
        specialActivities: this.cachedData.specialActivities.length,
        sessions: this.cachedData.existingSessions.length,
        students: this.cachedData.students.length
      }
    };
  }
}

export const optimizedConflictDetectionService = new OptimizedConflictDetectionService();