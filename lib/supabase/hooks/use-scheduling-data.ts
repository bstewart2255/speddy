import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSchool } from '@/app/components/providers/school-context';
import { createClient } from '@/lib/supabase/client';
import { SchedulingDataManager } from '@/lib/scheduling/scheduling-data-manager';
import type {
  ScheduleSession,
  BellSchedule,
  SpecialActivity,
  TimeRange,
  SchedulingSnapshot,
  SchedulingConflict,
  DataManagerConfig
} from '@/lib/scheduling/types/scheduling-data';

interface UseSchedulingDataReturn {
  // Data access
  isProviderAvailable: (day: number) => boolean;
  getProviderWorkDays: () => number[];
  getBellScheduleConflicts: (grade: string, day: number, startTime: string, endTime: string) => BellSchedule[];
  getSpecialActivityConflicts: (teacherName: string, day: number, startTime: string, endTime: string) => SpecialActivity[];
  getExistingSessions: (day?: number, timeRange?: TimeRange) => ScheduleSession[];
  getSessionsByStudent: (studentId: string) => ScheduleSession[];
  isSlotAvailable: (day: number, startTime: string, endTime: string) => boolean;
  getSlotCapacity: (day: number, startTime: string) => number;
  
  // Snapshot operations
  prepareSnapshot: () => SchedulingSnapshot;
  restoreSnapshot: (snapshot: SchedulingSnapshot) => void;
  
  // Cache management
  refresh: () => Promise<void>;
  clearCache: () => void;
  
  // Conflict detection
  checkForConflicts: () => SchedulingConflict[];
  
  // State
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  lastRefresh: Date | null;
  isCacheStale: boolean;
  
  // Metrics
  metrics: {
    cacheHits: number;
    cacheMisses: number;
    totalQueries: number;
    averageQueryTime: number;
  };
}

export function useSchedulingData(config?: DataManagerConfig): UseSchedulingDataReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isCacheStale, setIsCacheStale] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const { currentSchool } = useSchool();
  const supabase = createClient();
  
  // Get or create the singleton data manager instance
  const dataManager = useMemo(
    () => SchedulingDataManager.getInstance(config),
    [config]
  );
  
  // Initialize the data manager when school context changes
  useEffect(() => {
    const initializeDataManager = async () => {
      if (!currentSchool?.school_site) {
        setError('No school site selected');
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }
        
        // Always re-initialize when school changes to ensure proper filtering
        // Use empty string as fallback if school_district is somehow missing
        const schoolDistrict = currentSchool.school_district || '';
        await dataManager.initialize(user.id, currentSchool.school_site, schoolDistrict, currentSchool.school_id || undefined);
        setIsInitialized(true);
        setLastRefresh(new Date());
        
        setIsLoading(false);
      } catch (err) {
        console.error('[useSchedulingData] Initialization error:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize scheduling data');
        setIsLoading(false);
        setIsInitialized(false);
      }
    };
    
    initializeDataManager();
  }, [currentSchool, dataManager, supabase, refreshTrigger]);
  
  // Check cache staleness periodically
  useEffect(() => {
    const checkStaleness = () => {
      if (dataManager.isInitialized()) {
        setIsCacheStale(dataManager.isCacheStale());
      }
    };
    
    // Check immediately
    checkStaleness();
    
    // Check every minute
    const interval = setInterval(checkStaleness, 60000);
    
    return () => clearInterval(interval);
  }, [dataManager, lastRefresh]);
  
  // Wrapped data access methods with error handling
  const isProviderAvailable = useCallback((day: number): boolean => {
    if (!isInitialized || !currentSchool?.school_site) return false;
    try {
      return dataManager.isProviderAvailable(day, currentSchool.school_site);
    } catch (err) {
      console.error('[useSchedulingData] Error checking provider availability:', err);
      return false;
    }
  }, [dataManager, isInitialized, currentSchool]);
  
  const getProviderWorkDays = useCallback((): number[] => {
    if (!isInitialized || !currentSchool?.school_site) return [];
    try {
      return dataManager.getProviderWorkDays(currentSchool.school_site);
    } catch (err) {
      console.error('[useSchedulingData] Error getting provider work days:', err);
      return [];
    }
  }, [dataManager, isInitialized, currentSchool]);
  
  const getBellScheduleConflicts = useCallback((
    grade: string,
    day: number,
    startTime: string,
    endTime: string
  ): BellSchedule[] => {
    if (!isInitialized) return [];
    try {
      return dataManager.getBellScheduleConflicts(grade, day, startTime, endTime);
    } catch (err) {
      console.error('[useSchedulingData] Error getting bell schedule conflicts:', err);
      return [];
    }
  }, [dataManager, isInitialized]);
  
  const getSpecialActivityConflicts = useCallback((
    teacherName: string,
    day: number,
    startTime: string,
    endTime: string
  ): SpecialActivity[] => {
    if (!isInitialized) return [];
    try {
      return dataManager.getSpecialActivityConflicts(teacherName, day, startTime, endTime);
    } catch (err) {
      console.error('[useSchedulingData] Error getting special activity conflicts:', err);
      return [];
    }
  }, [dataManager, isInitialized]);
  
  const getExistingSessions = useCallback((
    day?: number,
    timeRange?: TimeRange
  ): ScheduleSession[] => {
    if (!isInitialized) return [];
    try {
      return dataManager.getExistingSessions(day, timeRange);
    } catch (err) {
      console.error('[useSchedulingData] Error getting existing sessions:', err);
      return [];
    }
  }, [dataManager, isInitialized]);
  
  const getSessionsByStudent = useCallback((studentId: string): ScheduleSession[] => {
    if (!isInitialized) return [];
    try {
      return dataManager.getSessionsByStudent(studentId);
    } catch (err) {
      console.error('[useSchedulingData] Error getting sessions by student:', err);
      return [];
    }
  }, [dataManager, isInitialized]);
  
  const isSlotAvailable = useCallback((
    day: number,
    startTime: string,
    endTime: string
  ): boolean => {
    if (!isInitialized || !currentSchool?.school_site) return false;
    try {
      return dataManager.isSlotAvailable(day, startTime, endTime, currentSchool.school_site);
    } catch (err) {
      console.error('[useSchedulingData] Error checking slot availability:', err);
      return false;
    }
  }, [dataManager, isInitialized, currentSchool]);
  
  const getSlotCapacity = useCallback((day: number, startTime: string): number => {
    if (!isInitialized) return 0;
    try {
      return dataManager.getSlotCapacity(day, startTime);
    } catch (err) {
      console.error('[useSchedulingData] Error getting slot capacity:', err);
      return 0;
    }
  }, [dataManager, isInitialized]);
  
  // Snapshot operations
  const prepareSnapshot = useCallback((): SchedulingSnapshot => {
    if (!isInitialized) {
      throw new Error('Data manager not initialized');
    }
    return dataManager.prepareForSnapshot();
  }, [dataManager, isInitialized]);
  
  const restoreSnapshot = useCallback((snapshot: SchedulingSnapshot): void => {
    if (!isInitialized) {
      throw new Error('Data manager not initialized');
    }
    dataManager.restoreFromSnapshot(snapshot);
    setRefreshTrigger(prev => prev + 1); // Trigger re-render
  }, [dataManager, isInitialized]);
  
  // Cache management
  const refresh = useCallback(async (): Promise<void> => {
    if (!isInitialized) {
      throw new Error('Data manager not initialized');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await dataManager.refresh();
      setLastRefresh(new Date());
      setIsCacheStale(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('[useSchedulingData] Refresh error:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [dataManager, isInitialized]);
  
  const clearCache = useCallback((): void => {
    if (!isInitialized) return;
    dataManager.clearCache();
    setIsCacheStale(true);
    setRefreshTrigger(prev => prev + 1);
  }, [dataManager, isInitialized]);
  
  // Conflict detection
  const checkForConflicts = useCallback((): SchedulingConflict[] => {
    if (!isInitialized) return [];
    try {
      return dataManager.checkForConflicts();
    } catch (err) {
      console.error('[useSchedulingData] Error checking conflicts:', err);
      return [];
    }
  }, [dataManager, isInitialized]);
  
  // Get current metrics
  const metrics = useMemo(() => {
    if (!isInitialized) {
      return {
        cacheHits: 0,
        cacheMisses: 0,
        totalQueries: 0,
        averageQueryTime: 0
      };
    }
    return dataManager.getMetrics();
  }, [dataManager, isInitialized, refreshTrigger]);
  
  return {
    // Data access
    isProviderAvailable,
    getProviderWorkDays,
    getBellScheduleConflicts,
    getSpecialActivityConflicts,
    getExistingSessions,
    getSessionsByStudent,
    isSlotAvailable,
    getSlotCapacity,
    
    // Snapshot operations
    prepareSnapshot,
    restoreSnapshot,
    
    // Cache management
    refresh,
    clearCache,
    
    // Conflict detection
    checkForConflicts,
    
    // State
    isLoading,
    isInitialized,
    error,
    lastRefresh,
    isCacheStale,
    
    // Metrics
    metrics
  };
}