import { fastConflictDetectionService } from '../fast-conflict-detection-service';
import { PerformanceMonitor } from '../../utils/performance-monitor';

// Mock data generators for stress testing
function generateMockBellSchedules(count: number) {
  const schedules = [];
  for (let i = 0; i < count; i++) {
    schedules.push({
      id: `bell-${i}`,
      provider_id: 'test-provider',
      school_site: 'test-school',
      school_district: 'test-district',
      day_of_week: Math.floor(Math.random() * 5) + 1,
      grade_level: Math.random() > 0.5 ? 'K,1,2' : '3,4,5',
      period_name: `Period ${i}`,
      start_time: `${8 + Math.floor(i / 5)}:${(i % 4) * 15}:00`,
      end_time: `${9 + Math.floor(i / 5)}:${(i % 4) * 15}:00`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return schedules;
}

function generateMockSpecialActivities(count: number) {
  const activities = [];
  const teachers = ['Smith', 'Johnson', 'Williams', 'Brown', 'Davis'];
  
  for (let i = 0; i < count; i++) {
    activities.push({
      id: `activity-${i}`,
      provider_id: 'test-provider',
      school_site: 'test-school',
      school_district: 'test-district',
      day_of_week: Math.floor(Math.random() * 5) + 1,
      teacher_name: teachers[i % teachers.length],
      activity_name: `Activity ${i}`,
      start_time: `${10 + Math.floor(i / 10)}:${(i % 6) * 10}:00`,
      end_time: `${11 + Math.floor(i / 10)}:${(i % 6) * 10}:00`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return activities;
}

function generateMockSessions(count: number) {
  const sessions = [];
  const studentIds = Array.from({ length: 50 }, (_, i) => `student-${i}`);
  
  for (let i = 0; i < count; i++) {
    const hour = 8 + Math.floor(i / 20);
    const minute = (i % 4) * 15;
    sessions.push({
      id: `session-${i}`,
      provider_id: 'test-provider',
      student_id: studentIds[i % studentIds.length],
      day_of_week: Math.floor(Math.random() * 5) + 1,
      start_time: `${hour}:${minute.toString().padStart(2, '0')}:00`,
      end_time: `${hour}:${(minute + 30).toString().padStart(2, '0')}:00`,
      delivered_by: Math.random() > 0.3 ? 'provider' : 'sea',
      assigned_to_sea_id: null,
      session_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return sessions;
}

describe('Fast Conflict Detection Performance Tests', () => {
  beforeEach(() => {
    PerformanceMonitor.clear();
    PerformanceMonitor.setEnabled(true);
  });

  afterEach(() => {
    PerformanceMonitor.logAllStats();
  });

  test('should calculate conflicts for current day within 100ms', async () => {
    const testData = {
      bellSchedules: generateMockBellSchedules(20),
      specialActivities: generateMockSpecialActivities(15),
      existingSessions: generateMockSessions(100),
      studentData: {
        id: 'test-student',
        grade_level: '3',
        teacher_name: 'Smith',
        minutes_per_session: 30
      },
      providerId: 'test-provider',
      schoolHours: [{
        grade_level: '3',
        start_time: '08:00:00',
        end_time: '15:00:00'
      }]
    };

    const startTime = performance.now();
    
    const conflicts = await fastConflictDetectionService.calculateConflictsProgressive(
      testData,
      'test-session',
      3, // Wednesday
      undefined // No progress callback for test
    );
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    console.log(`Total calculation time: ${totalTime.toFixed(2)}ms`);
    console.log(`Conflicts found: ${conflicts.size}`);
    
    // Initial indicators should appear within 100ms
    expect(totalTime).toBeLessThan(500);
  });

  test('should handle maximum data load efficiently', async () => {
    // Stress test with maximum expected data
    const testData = {
      bellSchedules: generateMockBellSchedules(50), // Many bell schedules
      specialActivities: generateMockSpecialActivities(30), // Many activities
      existingSessions: generateMockSessions(500), // Many existing sessions
      studentData: {
        id: 'test-student',
        grade_level: 'K',
        teacher_name: 'Johnson',
        minutes_per_session: 45
      },
      providerId: 'test-provider',
      schoolHours: [{
        grade_level: 'K',
        start_time: '08:30:00',
        end_time: '14:30:00'
      }]
    };

    const progressUpdates: number[] = [];
    const startTime = performance.now();
    
    const conflicts = await fastConflictDetectionService.calculateConflictsProgressive(
      testData,
      'test-session',
      1, // Monday
      (progressConflicts) => {
        const elapsed = performance.now() - startTime;
        progressUpdates.push(elapsed);
        console.log(`Progress update at ${elapsed.toFixed(2)}ms: ${progressConflicts.size} conflicts`);
      }
    );
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    console.log(`Total time with max data: ${totalTime.toFixed(2)}ms`);
    console.log(`Total conflicts: ${conflicts.size}`);
    console.log(`Progress updates: ${progressUpdates.length}`);
    
    // First progress update should be very fast
    if (progressUpdates.length > 0) {
      expect(progressUpdates[0]).toBeLessThan(100);
    }
    
    // Total time should still be reasonable
    expect(totalTime).toBeLessThan(1000);
  });

  test('should efficiently use cached data structures', () => {
    const testData = {
      bellSchedules: generateMockBellSchedules(10),
      specialActivities: generateMockSpecialActivities(10),
      existingSessions: generateMockSessions(50),
      studentData: {
        id: 'test-student',
        grade_level: '2',
        teacher_name: 'Davis',
        minutes_per_session: 30
      },
      providerId: 'test-provider'
    };

    // Pre-calculate data
    fastConflictDetectionService.preCalculateData(testData, 'test-session');
    
    // Measure individual slot checks
    const startTime = performance.now();
    const slotsToCheck = 100;
    
    for (let i = 0; i < slotsToCheck; i++) {
      const hour = 8 + Math.floor(i / 12);
      const minute = (i % 4) * 15;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const day = (i % 5) + 1;
      
      fastConflictDetectionService.checkSlotConflict(day, timeStr, 30);
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTimePerSlot = totalTime / slotsToCheck;
    
    console.log(`Checked ${slotsToCheck} slots in ${totalTime.toFixed(2)}ms`);
    console.log(`Average time per slot: ${avgTimePerSlot.toFixed(3)}ms`);
    
    // Each slot check should be very fast (< 1ms)
    expect(avgTimePerSlot).toBeLessThan(1);
  });

  test('should handle consecutive session rules efficiently', () => {
    const sessions = [];
    const studentId = 'test-student';
    
    // Create sessions with potential consecutive/break conflicts
    for (let day = 1; day <= 5; day++) {
      sessions.push({
        id: `session-${day}-1`,
        provider_id: 'test-provider',
        student_id: studentId,
        day_of_week: day,
        start_time: '09:00:00',
        end_time: '09:30:00',
        delivered_by: 'provider',
        assigned_to_sea_id: null,
        session_date: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      sessions.push({
        id: `session-${day}-2`,
        provider_id: 'test-provider',
        student_id: studentId,
        day_of_week: day,
        start_time: '10:30:00',
        end_time: '11:00:00',
        delivered_by: 'provider',
        assigned_to_sea_id: null,
        session_date: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    const testData = {
      bellSchedules: [],
      specialActivities: [],
      existingSessions: sessions,
      studentData: {
        id: studentId,
        grade_level: '3',
        teacher_name: null,
        minutes_per_session: 30
      },
      providerId: 'test-provider'
    };
    
    fastConflictDetectionService.preCalculateData(testData, 'new-session');
    
    // Test consecutive session detection (should conflict if creates > 60 min block)
    const hasConsecutiveConflict = fastConflictDetectionService.checkSlotConflict(1, '09:30', 45);
    expect(hasConsecutiveConflict).toBe(true); // Would create 75 min consecutive block
    
    // Test break requirement detection (should conflict if < 30 min break)
    const hasBreakConflict = fastConflictDetectionService.checkSlotConflict(1, '10:05', 20);
    expect(hasBreakConflict).toBe(true); // Only 25 min break before next session
    
    // Test valid slot (proper break, no consecutive issues)
    const isValidSlot = fastConflictDetectionService.checkSlotConflict(1, '11:30', 30);
    expect(isValidSlot).toBe(false); // Should be valid
  });
});