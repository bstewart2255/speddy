/**
 * Performance test for OptimizedScheduler to verify N+1 query reduction
 * 
 * Expected results:
 * - Before optimization: 100+ queries for scheduling multiple students
 * - After optimization: 1-3 queries total (1 batch fetch + 1 insert)
 */

import { OptimizedScheduler } from './optimized-scheduler';

// Mock data for testing
const mockStudents = [
  {
    id: 'student1',
    initials: 'JS',
    grade_level: '3',
    teacher_name: 'Ms. Smith',
    sessions_per_week: 3,
    minutes_per_session: 30,
    school_site: 'test-school'
  },
  {
    id: 'student2',
    initials: 'AB',
    grade_level: '3',
    teacher_name: 'Ms. Smith',
    sessions_per_week: 2,
    minutes_per_session: 45,
    school_site: 'test-school'
  },
  {
    id: 'student3',
    initials: 'CD',
    grade_level: '4',
    teacher_name: 'Mr. Jones',
    sessions_per_week: 4,
    minutes_per_session: 30,
    school_site: 'test-school'
  },
  {
    id: 'student4',
    initials: 'EF',
    grade_level: 'K',
    teacher_name: 'Ms. Brown',
    sessions_per_week: 5,
    minutes_per_session: 20,
    school_site: 'test-school'
  },
  {
    id: 'student5',
    initials: 'GH',
    grade_level: '5',
    teacher_name: 'Mr. Davis',
    sessions_per_week: 2,
    minutes_per_session: 60,
    school_site: 'test-school'
  }
];

async function runPerformanceTest() {
  console.log('========================================');
  console.log('OptimizedScheduler Performance Test');
  console.log('========================================\n');
  
  const providerId = 'test-provider-id';
  const providerRole = 'specialist';
  const schoolSite = 'test-school';
  
  // Create scheduler instance
  const scheduler = new OptimizedScheduler(providerId, providerRole);
  
  try {
    // Reset metrics for clean test
    scheduler.resetPerformanceMetrics();
    
    console.log('Step 1: Initializing context (batch data fetch)...');
    const startInit = Date.now();
    await scheduler.initializeContext(schoolSite);
    const initTime = Date.now() - startInit;
    console.log(`Context initialization took ${initTime}ms\n`);
    
    console.log('Step 2: Scheduling batch of students...');
    const startSchedule = Date.now();
    const result = await scheduler.scheduleBatch(mockStudents as any);
    const scheduleTime = Date.now() - startSchedule;
    
    console.log(`\nScheduling Results:`);
    console.log(`- Students to schedule: ${mockStudents.length}`);
    console.log(`- Successfully scheduled: ${result.totalScheduled}`);
    console.log(`- Failed to schedule: ${result.totalFailed}`);
    console.log(`- Total time: ${scheduleTime}ms`);
    
    if (result.errors.length > 0) {
      console.log(`\nErrors encountered:`);
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    // Get final performance metrics
    const metrics = scheduler.getPerformanceMetrics();
    
    console.log('\n========================================');
    console.log('Performance Metrics Summary:');
    console.log('========================================');
    console.log(`Total Database Queries: ${metrics.totalQueries}`);
    console.log(`Batch Queries: ${metrics.batchQueries}`);
    console.log(`Cache Hits: ${metrics.cacheHits}`);
    console.log(`Cache Misses: ${metrics.cacheMisses}`);
    
    // Calculate query reduction
    const expectedQueriesWithoutOptimization = 
      mockStudents.length * // For each student
      mockStudents.reduce((sum, s) => sum + s.sessions_per_week, 0) * // For each session
      10; // Approximate queries per session (bell schedules, activities, availability checks)
    
    console.log(`\nQuery Reduction Analysis:`);
    console.log(`- Expected queries WITHOUT optimization: ~${expectedQueriesWithoutOptimization}`);
    console.log(`- Actual queries WITH optimization: ${metrics.totalQueries}`);
    console.log(`- Reduction: ${Math.round((1 - metrics.totalQueries / expectedQueriesWithoutOptimization) * 100)}%`);
    
    // Success criteria check
    const SUCCESS_THRESHOLD = 10; // Should be less than 10 queries total
    if (metrics.totalQueries <= SUCCESS_THRESHOLD) {
      console.log(`\n✅ SUCCESS: Query count (${metrics.totalQueries}) is within target (≤${SUCCESS_THRESHOLD})`);
    } else {
      console.log(`\n⚠️  WARNING: Query count (${metrics.totalQueries}) exceeds target (≤${SUCCESS_THRESHOLD})`);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  runPerformanceTest().catch(console.error);
}

export { runPerformanceTest };