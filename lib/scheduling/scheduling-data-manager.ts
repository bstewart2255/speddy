import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/src/types/database';
import type {
  Student,
  ScheduleSession,
  BellSchedule,
  SpecialActivity,
  Profile,
  TimeRange,
  AvailabilitySlot,
  SchedulingSnapshot,
  SchedulingDataVersion,
  VersionedSchedulingData,
  CacheMetadata,
  DataManagerConfig,
  SchedulingConflict,
  SchedulingDataManagerInterface
} from './types/scheduling-data';

const DEFAULT_CONFIG: DataManagerConfig = {
  maxCacheAge: 15 * 60 * 1000, // 15 minutes
  enableConflictDetection: true,
  retryAttempts: 3,
  retryDelay: 1000 // 1 second
};

export class SchedulingDataManager implements SchedulingDataManagerInterface {
  private static instance: SchedulingDataManager | null = null;
  private supabase = createClient<Database>();
  private config: DataManagerConfig;
  private initialized = false;
  private providerId: string | null = null;
  private providerRole: string | null = null;
  private schoolSite: string | null = null;
  private schoolDistrict: string | null = null;
  private schoolId: string | null = null;
  
  // Core data structures
  private data: VersionedSchedulingData = {
    data: {
      providerAvailability: new Map(),
      bellSchedules: new Map(),
      specialActivities: new Map(),
      existingSessions: new Map(),
      schoolHours: []
    },
    version: {
      lastModified: new Date().toISOString(),
      version: 1,
      modifiedBy: ''
    }
  };
  
  // Cache metadata
  private cacheMetadata: CacheMetadata = {
    lastFetched: new Date(),
    isStale: false,
    fetchErrors: [],
    queryCount: 0
  };
  
  // Performance metrics
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    totalQueries: 0,
    queryTimes: [] as number[]
  };
  
  // Conflict tracking
  private conflicts: SchedulingConflict[] = [];
  
  private constructor(config?: DataManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Get singleton instance of SchedulingDataManager
   */
  public static getInstance(config?: DataManagerConfig): SchedulingDataManager {
    if (!SchedulingDataManager.instance) {
      SchedulingDataManager.instance = new SchedulingDataManager(config);
    }
    return SchedulingDataManager.instance;
  }
  
  /**
   * Initialize the data manager with provider and school context
   */
  public async initialize(providerId: string, schoolSite: string, schoolDistrict: string, schoolId?: string, providerRole?: string): Promise<void> {
    console.log(`[DataManager] Initializing for provider ${providerId} at ${schoolSite}/${schoolDistrict} (school_id: ${schoolId}, role: ${providerRole})`);

    this.providerId = providerId;
    this.providerRole = providerRole || null;
    this.schoolSite = schoolSite;
    this.schoolDistrict = schoolDistrict;
    this.schoolId = schoolId || null;
    this.data.version.modifiedBy = providerId;

    await this.loadAllData();
    this.initialized = true;
  }
  
  /**
   * Check if the data manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if the data manager is initialized for a specific school
   */
  public isInitializedForSchool(schoolSite: string, schoolDistrict?: string): boolean {
    return this.initialized &&
           this.schoolSite === schoolSite &&
           this.schoolDistrict === (schoolDistrict || this.schoolDistrict);
  }
  
  /**
   * Load all scheduling data in optimized batch queries
   */
  private async loadAllData(): Promise<void> {
    const startTime = performance.now();
    this.cacheMetadata.fetchErrors = [];
    
    try {
      // Try to use the batch RPC if available
      const { data, error } = await this.supabase.rpc('get_scheduling_data_batch', {
        p_provider_id: this.providerId!,
        p_school_site: this.schoolSite!,
        p_school_id: this.schoolId
      }).single();
      
      if (error) {
        console.log('[DataManager] Batch RPC not available, using parallel queries');
        await this.loadDataParallel();
      } else {
        this.processBatchData(data);
      }
      
      this.cacheMetadata.lastFetched = new Date();
      this.cacheMetadata.isStale = false;
      this.cacheMetadata.queryCount++;
      
      const elapsed = performance.now() - startTime;
      this.metrics.queryTimes.push(elapsed);
      this.metrics.totalQueries++;
      
      console.log(`[DataManager] Data loaded in ${elapsed.toFixed(2)}ms`);
    } catch (error) {
      console.error('[DataManager] Failed to load data:', error);
      this.cacheMetadata.fetchErrors.push(error.message);
      throw error;
    }
  }
  
  /**
   * Load data using parallel queries as fallback
   */
  private async loadDataParallel(): Promise<void> {
    const [
      providerAvailability,
      bellSchedules,
      specialActivities,
      existingSessions,
      schoolHours
    ] = await Promise.all([
      this.fetchProviderAvailability(),
      this.fetchBellSchedules(),
      this.fetchSpecialActivities(),
      this.fetchExistingSessions(),
      this.fetchSchoolHours()
    ]);
    
    // Process and cache the data
    this.cacheProviderAvailability(providerAvailability);
    this.cacheBellSchedules(bellSchedules);
    this.cacheSpecialActivities(specialActivities);
    this.cacheExistingSessions(existingSessions);
    this.data.data.schoolHours = schoolHours;
  }
  
  /**
   * Process batch data from RPC
   */
  private processBatchData(data: any): void {
    if (data.provider_availability) {
      this.cacheProviderAvailability(data.provider_availability);
    }
    if (data.bell_schedules) {
      this.cacheBellSchedules(data.bell_schedules);
    }
    if (data.special_activities) {
      this.cacheSpecialActivities(data.special_activities);
    }
    if (data.existing_sessions) {
      this.cacheExistingSessions(data.existing_sessions);
    }
    if (data.school_hours) {
      this.data.data.schoolHours = data.school_hours;
    }
  }
  
  /**
   * Fetch provider availability
   */
  private async fetchProviderAvailability(): Promise<any[]> {
    // Note: user_site_schedules uses site_id which is a UUID from provider_schools table
    // We need to get the provider_schools record first to get the UUID
    const { data: schoolData, error: schoolError } = await this.supabase
      .from('provider_schools')
      .select('id')
      .or(`school_site.eq.${this.schoolSite},school_id.eq.${this.schoolId}`)
      .single();
    
    if (schoolError || !schoolData) {
      console.log('[DataManager] Could not find provider_schools record, skipping availability fetch');
      return [];
    }
    
    const { data, error } = await this.supabase
      .from('user_site_schedules')
      .select('*')
      .eq('user_id', this.providerId!)
      .eq('site_id', schoolData.id);
    
    if (error) {
      this.cacheMetadata.fetchErrors.push(`Provider availability: ${error.message}`);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Fetch bell schedules
   */
  private async fetchBellSchedules(): Promise<BellSchedule[]> {
    let query = this.supabase
      .from('bell_schedules')
      .select('*');
    
    // Use school_id if available, otherwise fall back to school_site
    if (this.schoolId) {
      query = query.eq('school_id', this.schoolId);
    } else {
      query = query.eq('school_site', this.schoolSite!);
    }
    
    const { data, error } = await query;
    
    if (error) {
      this.cacheMetadata.fetchErrors.push(`Bell schedules: ${error.message}`);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Fetch special activities
   */
  private async fetchSpecialActivities(): Promise<SpecialActivity[]> {
    let query = this.supabase
      .from('special_activities')
      .select('*');
    
    // Use school_id if available, otherwise fall back to school_site
    if (this.schoolId) {
      query = query.eq('school_id', this.schoolId);
    } else {
      query = query.eq('school_site', this.schoolSite!);
    }
    
    const { data, error } = await query;
    
    if (error) {
      this.cacheMetadata.fetchErrors.push(`Special activities: ${error.message}`);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Fetch existing sessions
   */
  private async fetchExistingSessions(): Promise<ScheduleSession[]> {
    // First, fetch students for this school to get their IDs
    const { data: students, error: studentError } = await this.supabase
      .from('students')
      .select('id')
      .eq('provider_id', this.providerId!)
      .eq('school_site', this.schoolSite!)
      .eq('school_district', this.schoolDistrict!);

    if (studentError) {
      this.cacheMetadata.fetchErrors.push(`Students fetch: ${studentError.message}`);
      return [];
    }

    const studentIds = students?.map(s => s.id) || [];

    // For specialist users, also fetch sessions assigned to them (even from other providers' students)
    let sessionsResult;
    if (this.providerRole && ['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(this.providerRole)) {
      // Fetch sessions where:
      // 1. Student belongs to this user (any sessions for my students)
      // 2. OR assigned to this user (sessions assigned to me, regardless of whose students)
      if (studentIds.length > 0) {
        sessionsResult = await this.supabase
          .from('schedule_sessions')
          .select('*')
          .or(`student_id.in.(${studentIds.join(',')}),assigned_to_specialist_id.eq.${this.providerId}`);
      } else {
        // No students, only fetch assigned sessions
        sessionsResult = await this.supabase
          .from('schedule_sessions')
          .select('*')
          .eq('assigned_to_specialist_id', this.providerId!);
      }

      // Filter assigned sessions to only include those for students at the current school
      if (!sessionsResult.error && sessionsResult.data) {
        const assignedSessionStudentIds = sessionsResult.data
          .filter(session => session.assigned_to_specialist_id === this.providerId && !studentIds.includes(session.student_id))
          .map(session => session.student_id);

        if (assignedSessionStudentIds.length > 0) {
          // Fetch students from assigned sessions to check their school
          const { data: assignedStudentsCheck } = await this.supabase
            .from('students')
            .select('id')
            .in('id', assignedSessionStudentIds)
            .eq('school_site', this.schoolSite!)
            .eq('school_district', this.schoolDistrict!);

          const validAssignedStudentIds = assignedStudentsCheck?.map(s => s.id) || [];

          // Filter sessions to only include valid assigned sessions
          sessionsResult.data = sessionsResult.data.filter(session =>
            studentIds.includes(session.student_id) || // My students
            (session.assigned_to_specialist_id === this.providerId && validAssignedStudentIds.includes(session.student_id)) // Assigned sessions from current school only
          );
        }
      }
    } else {
      // For non-specialist users, only fetch their own students' sessions
      if (studentIds.length === 0) {
        console.log('[DataManager] No students found for school, returning empty sessions');
        return [];
      }

      sessionsResult = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', this.providerId!)
        .in('student_id', studentIds);
    }

    if (sessionsResult.error) {
      this.cacheMetadata.fetchErrors.push(`Existing sessions: ${sessionsResult.error.message}`);
      return [];
    }

    console.log(`[DataManager] Fetched ${sessionsResult.data?.length || 0} sessions for ${studentIds.length} students at ${this.schoolSite}`);
    return sessionsResult.data || [];
  }
  
  /**
   * Fetch school hours
   */
  private async fetchSchoolHours(): Promise<any[]> {
    let query = this.supabase
      .from('school_hours')
      .select('*');
    
    // School hours might still use school_site
    if (this.schoolId) {
      // Try school_id first, but this table might not be migrated yet
      query = query.eq('school_site', this.schoolSite!);
    } else {
      query = query.eq('school_site', this.schoolSite!);
    }
    
    const { data, error } = await query;
    
    if (error) {
      this.cacheMetadata.fetchErrors.push(`School hours: ${error.message}`);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Cache provider availability data
   */
  private cacheProviderAvailability(availability: any[]): void {
    this.data.data.providerAvailability.clear();
    
    availability.forEach(slot => {
      const key = `${this.providerId}`;
      if (!this.data.data.providerAvailability.has(key)) {
        this.data.data.providerAvailability.set(key, new Map());
      }
      
      const dayMap = this.data.data.providerAvailability.get(key)!;
      if (!dayMap.has(slot.day_of_week)) {
        dayMap.set(slot.day_of_week, []);
      }
      
      dayMap.get(slot.day_of_week)!.push({
        dayOfWeek: slot.day_of_week,
        startTime: '08:00',
        endTime: '15:00',
        schoolSite: this.schoolSite!
      });
    });
  }
  
  /**
   * Cache bell schedules by grade and day
   */
  private cacheBellSchedules(schedules: BellSchedule[]): void {
    this.data.data.bellSchedules.clear();
    
    schedules.forEach(schedule => {
      const gradeKey = schedule.grade_level;
      if (!this.data.data.bellSchedules.has(gradeKey)) {
        this.data.data.bellSchedules.set(gradeKey, new Map());
      }
      
      const dayMap = this.data.data.bellSchedules.get(gradeKey)!;
      if (!dayMap.has(schedule.day_of_week)) {
        dayMap.set(schedule.day_of_week, []);
      }
      
      dayMap.get(schedule.day_of_week)!.push(schedule);
    });
  }
  
  /**
   * Cache special activities by teacher and day
   */
  private cacheSpecialActivities(activities: SpecialActivity[]): void {
    this.data.data.specialActivities.clear();
    
    activities.forEach(activity => {
      const teacherKey = activity.teacher_name;
      if (!this.data.data.specialActivities.has(teacherKey)) {
        this.data.data.specialActivities.set(teacherKey, new Map());
      }
      
      const dayMap = this.data.data.specialActivities.get(teacherKey)!;
      if (!dayMap.has(activity.day_of_week)) {
        dayMap.set(activity.day_of_week, []);
      }
      
      dayMap.get(activity.day_of_week)!.push(activity);
    });
  }
  
  /**
   * Cache existing sessions by day and time
   */
  private cacheExistingSessions(sessions: ScheduleSession[]): void {
    this.data.data.existingSessions.clear();

    // Only process scheduled sessions (with non-null times)
    sessions
      .filter(session => session.day_of_week !== null && session.start_time !== null && session.end_time !== null)
      .forEach(session => {
        if (!this.data.data.existingSessions.has(session.day_of_week!)) {
          this.data.data.existingSessions.set(session.day_of_week!, new Map());
        }

        const timeMap = this.data.data.existingSessions.get(session.day_of_week!)!;
        const timeKey = `${session.start_time!}-${session.end_time!}`;
        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, []);
        }

        timeMap.get(timeKey)!.push(session);
      });
  }
  
  /**
   * Check if provider is available on a given day
   */
  public isProviderAvailable(day: number, schoolSite: string): boolean {
    const providerMap = this.data.data.providerAvailability.get(this.providerId!);
    if (!providerMap) {
      this.metrics.cacheMisses++;
      return false;
    }
    
    const daySlots = providerMap.get(day);
    if (!daySlots) {
      this.metrics.cacheMisses++;
      return false;
    }
    
    this.metrics.cacheHits++;
    return daySlots.some(slot => slot.schoolSite === schoolSite);
  }
  
  /**
   * Get provider work days for a school
   */
  public getProviderWorkDays(schoolSite: string): number[] {
    const providerMap = this.data.data.providerAvailability.get(this.providerId!);
    if (!providerMap) {
      this.metrics.cacheMisses++;
      return [];
    }
    
    const workDays: number[] = [];
    providerMap.forEach((slots, day) => {
      if (slots.some(slot => slot.schoolSite === schoolSite)) {
        workDays.push(day);
      }
    });
    
    this.metrics.cacheHits++;
    return workDays.sort();
  }
  
  /**
   * Get bell schedule conflicts for a time slot
   */
  public getBellScheduleConflicts(
    grade: string,
    day: number,
    startTime: string,
    endTime: string
  ): BellSchedule[] {
    const gradeMap = this.data.data.bellSchedules.get(grade);
    if (!gradeMap) {
      this.metrics.cacheMisses++;
      return [];
    }
    
    const daySchedules = gradeMap.get(day);
    if (!daySchedules) {
      this.metrics.cacheMisses++;
      return [];
    }
    
    this.metrics.cacheHits++;
    return daySchedules.filter(schedule => 
      this.timeRangesOverlap(
        { startTime, endTime },
        { startTime: schedule.start_time, endTime: schedule.end_time }
      )
    );
  }
  
  /**
   * Get special activity conflicts for a time slot
   */
  public getSpecialActivityConflicts(
    teacherName: string,
    day: number,
    startTime: string,
    endTime: string
  ): SpecialActivity[] {
    const teacherMap = this.data.data.specialActivities.get(teacherName);
    if (!teacherMap) {
      this.metrics.cacheMisses++;
      return [];
    }
    
    const dayActivities = teacherMap.get(day);
    if (!dayActivities) {
      this.metrics.cacheMisses++;
      return [];
    }
    
    this.metrics.cacheHits++;
    return dayActivities.filter(activity =>
      this.timeRangesOverlap(
        { startTime, endTime },
        { startTime: activity.start_time, endTime: activity.end_time }
      )
    );
  }
  
  /**
   * Get existing sessions with optional filters
   */
  public getExistingSessions(day?: number, timeRange?: TimeRange): ScheduleSession[] {
    const sessions: ScheduleSession[] = [];
    
    if (day !== undefined) {
      const dayMap = this.data.data.existingSessions.get(day);
      if (dayMap) {
        dayMap.forEach((sessionList) => {
          sessionList.forEach(session => {
            // Sessions in existingSessions cache are guaranteed to have non-null times
            if (!timeRange || this.timeRangesOverlap(
              timeRange,
              { startTime: session.start_time!, endTime: session.end_time! }
            )) {
              sessions.push(session);
            }
          });
        });
        this.metrics.cacheHits++;
      } else {
        this.metrics.cacheMisses++;
      }
    } else {
      // Get all sessions
      this.data.data.existingSessions.forEach(dayMap => {
        dayMap.forEach((sessionList) => {
          sessions.push(...sessionList);
        });
      });
      this.metrics.cacheHits++;
    }
    
    return sessions;
  }
  
  /**
   * Get sessions by student ID
   */
  public getSessionsByStudent(studentId: string): ScheduleSession[] {
    const sessions: ScheduleSession[] = [];
    
    this.data.data.existingSessions.forEach(dayMap => {
      dayMap.forEach((sessionList) => {
        sessions.push(...sessionList.filter(s => s.student_id === studentId));
      });
    });
    
    this.metrics.cacheHits++;
    return sessions;
  }
  
  /**
   * Check if a time slot is available (respecting 8 concurrent session limit)
   */
  public isSlotAvailable(
    day: number,
    startTime: string,
    endTime: string,
    schoolSite: string
  ): boolean {
    const capacity = this.getSlotCapacity(day, startTime);
    return capacity < 8; // Respect the 8 concurrent session limit
  }
  
  /**
   * Get the current capacity of a time slot
   */
  public getSlotCapacity(day: number, startTime: string): number {
    const dayMap = this.data.data.existingSessions.get(day);
    if (!dayMap) {
      this.metrics.cacheHits++;
      return 0;
    }
    
    let count = 0;
    dayMap.forEach((sessions, timeKey) => {
      const [slotStart] = timeKey.split('-');
      if (slotStart === startTime) {
        count += sessions.length;
      }
    });
    
    this.metrics.cacheHits++;
    return count;
  }
  
  /**
   * Prepare data for snapshot
   */
  public prepareForSnapshot(): SchedulingSnapshot {
    const allSessions = this.getExistingSessions();
    
    return {
      sessions: allSessions,
      timestamp: new Date().toISOString(),
      version: this.data.version.version,
      metadata: {
        providerId: this.providerId!,
        schoolSite: this.schoolSite!,
        totalSessions: allSessions.length
      }
    };
  }
  
  /**
   * Restore data from snapshot
   */
  public restoreFromSnapshot(snapshot: SchedulingSnapshot): void {
    // Clear existing sessions
    this.data.data.existingSessions.clear();
    
    // Re-cache sessions from snapshot
    this.cacheExistingSessions(snapshot.sessions);
    
    // Update version
    this.data.version.version = snapshot.version + 1;
    this.data.version.lastModified = new Date().toISOString();
    
    console.log(`[DataManager] Restored ${snapshot.sessions.length} sessions from snapshot`);
  }
  
  /**
   * Refresh all cached data
   */
  public async refresh(): Promise<void> {
    if (!this.providerId || !this.schoolSite) {
      throw new Error('DataManager not initialized');
    }
    
    console.log('[DataManager] Refreshing cache...');
    await this.loadAllData();
    this.data.version.version++;
    this.data.version.lastModified = new Date().toISOString();
  }
  
  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.data.data.providerAvailability.clear();
    this.data.data.bellSchedules.clear();
    this.data.data.specialActivities.clear();
    this.data.data.existingSessions.clear();
    this.data.data.schoolHours = [];
    
    this.cacheMetadata.isStale = true;
    this.conflicts = [];
    
    console.log('[DataManager] Cache cleared');
  }
  
  /**
   * Get current version information
   */
  public getVersion(): SchedulingDataVersion {
    return { ...this.data.version };
  }
  
  /**
   * Check for scheduling conflicts
   */
  public checkForConflicts(): SchedulingConflict[] {
    if (!this.config.enableConflictDetection) {
      return [];
    }
    
    // This would be enhanced with actual conflict detection logic
    return [...this.conflicts];
  }
  
  /**
   * Get performance metrics
   */
  public getMetrics() {
    const avgQueryTime = this.metrics.queryTimes.length > 0
      ? this.metrics.queryTimes.reduce((a, b) => a + b, 0) / this.metrics.queryTimes.length
      : 0;
    
    return {
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      totalQueries: this.metrics.totalQueries,
      averageQueryTime: avgQueryTime
    };
  }
  
  /**
   * Check if cache is stale
   */
  public isCacheStale(): boolean {
    const cacheAge = Date.now() - this.cacheMetadata.lastFetched.getTime();
    return cacheAge > this.config.maxCacheAge! || this.cacheMetadata.isStale;
  }
  
  /**
   * Helper: Check if two time ranges overlap
   */
  private timeRangesOverlap(range1: TimeRange, range2: TimeRange): boolean {
    const start1 = this.timeToMinutes(range1.startTime);
    const end1 = this.timeToMinutes(range1.endTime);
    const start2 = this.timeToMinutes(range2.startTime);
    const end2 = this.timeToMinutes(range2.endTime);
    
    return start1 < end2 && end1 > start2;
  }
  
  /**
   * Helper: Convert time string to minutes
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}