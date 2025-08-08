import { BellSchedule, SpecialActivity, ScheduleSession } from '@/src/types/database';
import { PerformanceMonitor } from '@/lib/utils/performance-monitor';

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

interface ConflictCheckData {
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  existingSessions: ScheduleSession[];
  studentData: Student;
  providerId: string;
  schoolHours?: SchoolHours[];
}

interface PreCalculatedData {
  bellScheduleMap: Map<string, BellSchedule>;
  specialActivityMap: Map<string, SpecialActivity>;
  existingSessionMap: Map<string, ScheduleSession>;
  sessionCapacityMap: Map<string, number>;
  studentSessionMap: Map<string, ScheduleSession>;
  schoolHoursStart?: number;
  schoolHoursEnd?: number;
  consecutiveSessionMap: Map<number, ScheduleSession[]>; // Sessions by day for the student
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

export class FastConflictDetectionService {
  private preCalculatedData: PreCalculatedData | null = null;
  private currentSessionId: string | null = null;
  
  private startHour = 7;
  private endHour = 18;
  private snapInterval = 15;

  preCalculateData(data: ConflictCheckData, sessionId: string): void {
    const endMeasure = PerformanceMonitor.start('FastConflict.preCalculateData');
    
    this.currentSessionId = sessionId;
    const { bellSchedules, specialActivities, existingSessions, studentData, schoolHours } = data;
    
    const bellScheduleMap = new Map<string, BellSchedule>();
    const specialActivityMap = new Map<string, SpecialActivity>();
    const existingSessionMap = new Map<string, ScheduleSession>();
    const sessionCapacityMap = new Map<string, number>();
    const studentSessionMap = new Map<string, ScheduleSession>();
    const consecutiveSessionMap = new Map<number, ScheduleSession[]>();
    
    // Pre-process school hours for the student's grade
    let schoolHoursStart: number | undefined;
    let schoolHoursEnd: number | undefined;
    if (schoolHours) {
      const studentSchoolHours = schoolHours.find(sh => 
        sh.grade_level === studentData.grade_level
      );
      if (studentSchoolHours) {
        schoolHoursStart = timeToMinutes(studentSchoolHours.start_time);
        schoolHoursEnd = timeToMinutes(studentSchoolHours.end_time);
      }
    }
    
    // Process bell schedules - only for student's grade
    const studentGrade = studentData.grade_level.trim();
    for (const schedule of bellSchedules) {
      const grades = schedule.grade_level.split(',').map(g => g.trim());
      if (grades.includes(studentGrade)) {
        const startMin = timeToMinutes(schedule.start_time);
        const endMin = timeToMinutes(schedule.end_time);
        
        // Use range-based approach instead of individual slots
        for (let min = startMin; min < endMin; min += this.snapInterval) {
          const timeStr = minutesToTime(min);
          const key = `${schedule.day_of_week}-${timeStr}`;
          bellScheduleMap.set(key, schedule);
        }
      }
    }
    
    // Process special activities - only for student's teacher
    if (studentData.teacher_name) {
      const teacherActivities = specialActivities.filter(
        a => a.teacher_name === studentData.teacher_name
      );
      
      for (const activity of teacherActivities) {
        const startMin = timeToMinutes(activity.start_time);
        const endMin = timeToMinutes(activity.end_time);
        
        for (let min = startMin; min < endMin; min += this.snapInterval) {
          const timeStr = minutesToTime(min);
          const key = `${activity.day_of_week}-${timeStr}`;
          specialActivityMap.set(key, activity);
        }
      }
    }
    
    // Process existing sessions and build capacity maps
    for (const session of existingSessions) {
      if (session.id === sessionId) continue;
      
      const startMin = timeToMinutes(session.start_time);
      const endMin = timeToMinutes(session.end_time);
      
      // Track student's own sessions for consecutive/break rules
      if (session.student_id === studentData.id) {
        if (!consecutiveSessionMap.has(session.day_of_week)) {
          consecutiveSessionMap.set(session.day_of_week, []);
        }
        consecutiveSessionMap.get(session.day_of_week)!.push(session);
      }
      
      // Build slot occupancy maps
      for (let min = startMin; min < endMin; min += this.snapInterval) {
        const timeStr = minutesToTime(min);
        const key = `${session.day_of_week}-${timeStr}`;
        
        // Track capacity
        const currentCapacity = sessionCapacityMap.get(key) || 0;
        sessionCapacityMap.set(key, currentCapacity + 1);
        
        // Track student's sessions
        if (session.student_id === studentData.id) {
          studentSessionMap.set(key, session);
        }
      }
    }
    
    // Sort consecutive sessions by start time for efficient checking
    for (const [day, sessions] of consecutiveSessionMap) {
      sessions.sort((a, b) => 
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
      );
    }
    
    this.preCalculatedData = {
      bellScheduleMap,
      specialActivityMap,
      existingSessionMap,
      sessionCapacityMap,
      studentSessionMap,
      schoolHoursStart,
      schoolHoursEnd,
      consecutiveSessionMap
    };
    
    endMeasure();
    
    console.log(`[FastConflict] Pre-calculation completed`, {
      bellSchedules: bellScheduleMap.size,
      specialActivities: specialActivityMap.size,
      sessionCapacity: sessionCapacityMap.size,
      studentSessions: studentSessionMap.size,
      studentDaysWithSessions: consecutiveSessionMap.size
    });
  }

  checkSlotConflict(day: number, timeStr: string, studentMinutes: number): boolean {
    if (!this.preCalculatedData) return false;
    
    const {
      bellScheduleMap,
      specialActivityMap,
      sessionCapacityMap,
      studentSessionMap,
      schoolHoursStart,
      schoolHoursEnd,
      consecutiveSessionMap
    } = this.preCalculatedData;
    
    const startMin = timeToMinutes(timeStr);
    const endMin = startMin + studentMinutes;
    
    // Check grid bounds
    if (endMin > this.endHour * 60) {
      return true;
    }
    
    // Check school hours if available
    if (schoolHoursStart !== undefined && schoolHoursEnd !== undefined) {
      if (startMin < schoolHoursStart || endMin > schoolHoursEnd) {
        return true;
      }
    }
    
    // Check consecutive session and break rules
    const daySessions = consecutiveSessionMap.get(day) || [];
    for (const session of daySessions) {
      const sessionStart = timeToMinutes(session.start_time);
      const sessionEnd = timeToMinutes(session.end_time);
      
      // Check for consecutive sessions > 60 minutes
      if (sessionEnd === startMin || endMin === sessionStart) {
        const totalConsecutive = studentMinutes + (sessionEnd - sessionStart);
        if (totalConsecutive > 60) {
          return true;
        }
      }
      
      // Check for break requirements (30 minutes between non-consecutive)
      const gapBefore = startMin - sessionEnd;
      const gapAfter = sessionStart - endMin;
      
      if ((gapBefore > 0 && gapBefore < 30) || (gapAfter > 0 && gapAfter < 30)) {
        return true;
      }
    }
    
    // Check all time slots in the session duration
    for (let min = startMin; min < endMin; min += this.snapInterval) {
      const checkTime = minutesToTime(min);
      const slotKey = `${day}-${checkTime}`;
      
      // Check bell schedule conflict
      if (bellScheduleMap.has(slotKey)) {
        return true;
      }
      
      // Check special activity conflict
      if (specialActivityMap.has(slotKey)) {
        return true;
      }
      
      // Check student overlap
      if (studentSessionMap.has(slotKey)) {
        return true;
      }
      
      // Check capacity (max 6 concurrent sessions)
      const capacity = sessionCapacityMap.get(slotKey) || 0;
      if (capacity >= 6) {
        return true;
      }
    }
    
    return false;
  }

  async calculateConflictsProgressive(
    data: ConflictCheckData,
    sessionId: string,
    currentDay: number,
    onProgress?: (conflicts: Set<string>) => void
  ): Promise<Set<string>> {
    const totalStart = performance.now();
    
    // Pre-calculate all data structures
    this.preCalculateData(data, sessionId);
    
    const conflictedSlots = new Set<string>();
    const { studentData } = data;
    
    const currentSession = data.existingSessions.find(s => s.id === sessionId);
    const currentStartTime = currentSession?.start_time.substring(0, 5);
    const currentSessionDay = currentSession?.day_of_week;
    
    const checkDay = (day: number) => {
      const endDayMeasure = PerformanceMonitor.start(`FastConflict.checkDay.${day}`);
      let dayConflicts = 0;
      
      // Generate all possible slots for the day in one pass
      for (let hour = this.startHour; hour < this.endHour; hour++) {
        for (let minute = 0; minute < 60; minute += this.snapInterval) {
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          const slotKey = `${day}-${timeStr}`;
          
          // Skip current session position
          if (day === currentSessionDay && timeStr === currentStartTime) {
            continue;
          }
          
          // Fast conflict check using pre-calculated data
          const hasConflict = this.checkSlotConflict(day, timeStr, studentData.minutes_per_session);
          
          if (hasConflict) {
            conflictedSlots.add(slotKey);
            dayConflicts++;
          }
        }
      }
      
      endDayMeasure();
      return dayConflicts;
    };
    
    // Priority order: current day first, then adjacent days
    const dayPriority = currentDay <= 5 ? [
      currentDay,
      ...(currentDay > 1 ? [currentDay - 1] : []),
      ...(currentDay < 5 ? [currentDay + 1] : []),
      ...Array.from({ length: 5 }, (_, i) => i + 1)
        .filter(d => d !== currentDay && d !== currentDay - 1 && d !== currentDay + 1)
    ] : [1, 2, 3, 4, 5];
    
    // Process current day immediately (should be < 50ms)
    if (dayPriority[0]) {
      checkDay(dayPriority[0]);
      if (onProgress) {
        onProgress(new Set(conflictedSlots));
      }
    }
    
    // Process remaining days asynchronously
    if (dayPriority.length > 1) {
      // Use requestIdleCallback for non-critical days if available
      const processRemainingDays = () => {
        for (let i = 1; i < dayPriority.length; i++) {
          checkDay(dayPriority[i]);
          
          // Update progress every 2 days to reduce UI updates
          if (i % 2 === 0 && onProgress) {
            onProgress(new Set(conflictedSlots));
          }
        }
        
        // Final update
        if (onProgress) {
          onProgress(new Set(conflictedSlots));
        }
      };
      
      // Process remaining days in next tick
      await new Promise(resolve => {
        setTimeout(() => {
          processRemainingDays();
          resolve(undefined);
        }, 0);
      });
    }
    
    const totalEnd = performance.now();
    const totalTime = (totalEnd - totalStart).toFixed(2);
    
    console.log(`[FastConflict] Completed in ${totalTime}ms (${conflictedSlots.size} conflicts)`);
    
    // Warn if taking too long
    if (parseFloat(totalTime) > 500) {
      console.warn('[FastConflict] Performance warning: calculation took > 500ms');
    }
    
    return conflictedSlots;
  }

  clearCache(): void {
    this.preCalculatedData = null;
    this.currentSessionId = null;
  }
}

export const fastConflictDetectionService = new FastConflictDetectionService();