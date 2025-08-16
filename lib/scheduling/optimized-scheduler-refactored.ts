import { createClient } from '@/lib/supabase/client';
import { SchedulingCoordinator, SchedulingCoordinatorConfig } from './scheduling-coordinator';
import { SchedulingDataManager } from './scheduling-data-manager';
import { DEFAULT_SCHEDULING_CONFIG } from './scheduling-config';
import type {
  Student,
  ScheduleSession,
  BellSchedule,
  SpecialActivity
} from './types/scheduling-data';
import type {
  TimeSlot,
  SchedulingContext,
  SchedulingResult
} from './types/scheduling-types';

interface StudentSchedule {
  studentId: string;
  sessions: Array<{
    day: number;
    startTime: string;
    endTime: string;
  }>;
}

/**
 * Refactored OptimizedScheduler that delegates to SchedulingCoordinator
 * Maintains backward compatibility with existing API
 */
export class OptimizedScheduler {
  private supabase = createClient();
  private coordinator: SchedulingCoordinator;
  private dataManager: SchedulingDataManager;
  private isInitialized = false;
  
  private performanceMetrics = {
    totalQueries: 0,
    batchQueries: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  constructor(
    private providerId: string,
    private providerRole: string
  ) {
    // Initialize coordinator with default config
    const coordinatorConfig: SchedulingCoordinatorConfig = {
      engineConfig: {
        maxRetries: DEFAULT_SCHEDULING_CONFIG.maxRetries,
        enableOptimization: DEFAULT_SCHEDULING_CONFIG.enableOptimization,
        enableParallelProcessing: DEFAULT_SCHEDULING_CONFIG.enableParallelProcessing
      },
      constraints: {
        maxConcurrentSessions: DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions,
        maxConsecutiveMinutes: DEFAULT_SCHEDULING_CONFIG.maxConsecutiveMinutes,
        minBreakMinutes: DEFAULT_SCHEDULING_CONFIG.minBreakMinutes,
        schoolEndTime: DEFAULT_SCHEDULING_CONFIG.schoolEndTime,
        maxSessionsPerDay: DEFAULT_SCHEDULING_CONFIG.maxSessionsPerDay,
        requireGradeGrouping: DEFAULT_SCHEDULING_CONFIG.gradeGroupingEnabled
      }
    };
    
    this.coordinator = new SchedulingCoordinator(coordinatorConfig);
    this.dataManager = SchedulingDataManager.getInstance();
  }

  /**
   * Initialize context - delegates to coordinator
   */
  async initializeContext(schoolSite: string, schoolDistrict?: string): Promise<SchedulingContext> {
    console.log(`[OptimizedScheduler] Initializing context for ${schoolSite}...`);
    console.log('[PERFORMANCE] Using refactored architecture with separated concerns');
    
    // Initialize data manager if needed
    if (!this.dataManager.isInitialized()) {
      // Use empty string as fallback for backward compatibility
      await this.dataManager.initialize(this.providerId, schoolSite, schoolDistrict || '', undefined);
    }
    
    // Initialize coordinator
    await this.coordinator.initialize(this.providerId, this.providerRole, schoolSite);
    this.isInitialized = true;
    
    // Return a mock context for backward compatibility
    // The real context is now internal to the coordinator
    return this.createBackwardCompatibleContext(schoolSite);
  }

  /**
   * Schedule batch - delegates to coordinator
   */
  async scheduleBatch(students: Student[]): Promise<{
    totalScheduled: number;
    totalFailed: number;
    errors: string[];
  }> {
    if (!this.isInitialized) {
      throw new Error('Context not initialized. Call initializeContext first.');
    }
    
    console.log(`[OptimizedScheduler] Scheduling ${students.length} students`);
    console.log('[PERFORMANCE] Using new modular architecture');
    
    const startTime = Date.now();
    
    // Delegate to coordinator
    const result = await this.coordinator.scheduleBatch(students);
    
    const elapsed = Date.now() - startTime;
    
    // Update local metrics from coordinator
    const coordinatorMetrics = this.coordinator.getMetrics();
    this.performanceMetrics.totalQueries = coordinatorMetrics.coordinator.totalQueries;
    this.performanceMetrics.cacheHits = coordinatorMetrics.coordinator.cacheHits;
    
    console.log('[PERFORMANCE] Batch scheduling complete');
    console.log(`[PERFORMANCE] Time elapsed: ${elapsed}ms`);
    console.log(`[PERFORMANCE] Students scheduled: ${result.totalScheduled}/${students.length}`);
    console.log(`[PERFORMANCE] Using modular components:`);
    console.log(`  - ConstraintValidator: ${coordinatorMetrics.validator.validationCount} validations`);
    console.log(`  - SessionDistributor: ${coordinatorMetrics.distributor.distributionCount} distributions`);
    console.log(`  - SchedulingEngine: ${coordinatorMetrics.engine.successRate * 100}% success rate`);
    
    // Return backward compatible result
    return {
      totalScheduled: result.totalScheduled,
      totalFailed: result.totalFailed,
      errors: result.errors
    };
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics() {
    const coordinatorMetrics = this.coordinator.getMetrics();
    
    return {
      ...this.performanceMetrics,
      coordinatorMetrics,
      architecture: 'modular',
      components: {
        validator: coordinatorMetrics.validator,
        distributor: coordinatorMetrics.distributor,
        engine: coordinatorMetrics.engine,
        coordinator: coordinatorMetrics.coordinator
      }
    };
  }

  /**
   * Reset performance metrics
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
   * Create backward compatible context object
   */
  private createBackwardCompatibleContext(schoolSite: string): SchedulingContext {
    // Get data from data manager for backward compatibility
    const workDays = this.dataManager.getProviderWorkDays(schoolSite);
    const existingSessions = this.dataManager.getExistingSessions();
    
    return {
      schoolSite,
      workDays,
      bellSchedules: [],
      specialActivities: [],
      existingSessions,
      validSlots: new Map(),
      schoolHours: [],
      studentGradeMap: new Map(),
      providerAvailability: new Map(),
      bellSchedulesByGrade: new Map(),
      specialActivitiesByTeacher: new Map(),
      cacheMetadata: {
        lastFetched: new Date(),
        isStale: false,
        fetchErrors: [],
        queryCount: 0
      }
    };
  }
}

/**
 * Factory function to determine which scheduler to use
 */
export function createOptimizedScheduler(
  providerId: string,
  providerRole: string,
  useRefactored: boolean = true
): OptimizedScheduler {
  if (useRefactored) {
    console.log('[Factory] Creating refactored OptimizedScheduler with modular architecture');
    return new OptimizedScheduler(providerId, providerRole);
  } else {
    console.log('[Factory] Creating legacy OptimizedScheduler');
    // Import and return legacy scheduler if needed
    const LegacyScheduler = require('./optimized-scheduler').OptimizedScheduler;
    return new LegacyScheduler(providerId, providerRole);
  }
}