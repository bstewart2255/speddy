import { createClient } from '@/lib/supabase/client';
import { getCurrentSchoolYear } from '@/lib/school-year';
import type { Database } from '@/src/types';
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
import type { OtherProviderSessionLite } from '@/lib/services/session-update-service';
import { isSpecialistSourceRole } from '@/lib/auth/role-utils';

type MainstreamingBlock = Database['public']['Tables']['mainstreaming_blocks']['Row'];
type StudentBlockedTime = Database['public']['Tables']['student_blocked_times']['Row'];
type StudentServiceTime = Database['public']['Tables']['student_service_times']['Row'];

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

  // SPE-458: the school year this cache holds. Set from getCurrentSchoolYear()
  // at initialize() rather than passed in — no scheduling caller has a year
  // selector (the provider Bell Schedules and Special Activities pages both pin
  // to the current year, and scheduling only ever happens in the year you are
  // in). Seeded here as well so it is never null if a fetch runs before
  // initialize(): an unset year would silently mean "every year", which is the
  // bug this field exists to close.
  private schoolYear: string = getCurrentSchoolYear();

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

  // SPE-287: cross-provider template sessions per owned student (studentId -> the other
  // provider's sessions for the SAME shared child), so the auto-scheduler can hard-avoid
  // double-booking that child. Loaded once per context; only shared students appear.
  private crossProviderSessions: Map<string, OtherProviderSessionLite[]> = new Map();

  // SPE-478: every mainstreaming block at this school for the current year —
  // ANY provider's, not just the caller's (the school-wide SELECT policy is
  // what makes this readable). Protected time: the auto-scheduler never places
  // a session over a student's time in a gen-ed class.
  private mainstreamingBlocks: MainstreamingBlock[] = [];
  // SPE-492: every protected time at this school for the current year — same
  // school-wide posture as mainstreaming blocks.
  private studentBlockedTimes: StudentBlockedTime[] = [];
  // SPE-513: every PUSH-IN service time at this school for the current year —
  // in-class support the auto-scheduler must not place a pull-out over.
  // Own-room entries are deliberately not loaded (a pull-out during the
  // resource period is normal service, not a conflict).
  private studentPushInTimes: StudentServiceTime[] = [];

  // SPE-318: the same activities cacheSpecialActivities indexes, kept flat for
  // the auto-scheduler (year-scoped and live-only at fetch — SPE-458/468).
  private specialActivitiesFlat: SpecialActivity[] = [];

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
   * Check if the data manager is initialized for a specific school.
   *
   * SPE-463: schoolId participates in the check. This singleton is shared
   * between the interactive schedule page and the auto-scheduler, and a cache
   * populated without a school_id filters bell schedules by school_site
   * instead — which finds nothing for schools migrated to school_id. Without
   * this, a caller that HAS the school_id would reuse that weaker cache and
   * silently keep the old behaviour.
   *
   * SPE-458: the cached school year is checked against the current one too.
   * This singleton outlives any one page, so a tab left open across the Aug 1
   * rollover would otherwise keep serving last year's bell schedules from
   * memory — the same "invisible but active" failure the school_year filter
   * closes at the query. No parameter for it: callers have no year to pass,
   * the only correct value is the current one, so this asks "is this cache
   * still for the year we are in?".
   */
  public isInitializedForSchool(schoolSite: string, schoolDistrict?: string, schoolId?: string): boolean {
    return this.initialized &&
           this.schoolSite === schoolSite &&
           this.schoolDistrict === (schoolDistrict || this.schoolDistrict) &&
           (schoolId === undefined || this.schoolId === schoolId) &&
           this.schoolYear === getCurrentSchoolYear();
  }
  
  /**
   * Load all scheduling data in optimized batch queries
   */
  private async loadAllData(): Promise<void> {
    const startTime = performance.now();
    this.cacheMetadata.fetchErrors = [];

    // SPE-458: re-derived on every load, not once at initialize(). refresh()
    // comes through here too — it fires whenever the 15-minute cache goes
    // stale — so pinning the year at initialize() would leave a page open
    // across the Aug 1 rollover reloading against last year forever, which
    // reads back as zero rows with no error.
    this.schoolYear = getCurrentSchoolYear();

    try {
      // Try to use the batch RPC if available.
      //
      // SPE-463 — READ BEFORE "FIXING" THIS RPC. `get_scheduling_data_batch`
      // currently throws on EVERY call, for every provider at every school:
      // its work_schedule CTE compares `uss.site_id = p_school_site`, and
      // site_id is uuid while p_school_site is text, so Postgres rejects the
      // statement at plan time (42883). The batch path has therefore never
      // returned data — the parallel path below is what actually runs.
      //
      // Repairing only that type error would make the RPC start succeeding,
      // and its bell_schedules / special_activities CTEs filter on
      // `provider_id = p_provider_id AND school_site = p_school_site`. Both
      // columns are NULL on site-admin-created rows, so it would return an
      // empty set, processBatchData would cache that, and the auto-scheduler
      // would go back to ignoring every bell schedule — the exact bug SPE-463
      // fixed. Key those CTEs on school_id at the same time, or drop the RPC.
      //
      // SPE-458: those same CTEs also select every school_year at once, which
      // the parallel path below no longer does. Repairing the RPC without
      // adding a school_year filter would reintroduce that bug on this path
      // only — visible just at schools holding two years of data.
      //
      // SPE-468/SPE-484: the special_activities CTE also has no deleted_at
      // filter. The parallel path strips soft-deleted rows in fetchForSchool,
      // and the scheduler now actually consumes this list (SPE-318), so a
      // repaired RPC without that filter would resurrect deleted activities
      // as scheduling blocks on this path only.
      const { data, error } = await this.supabase.rpc('get_scheduling_data_batch', {
        p_provider_id: this.providerId!,
        p_school_site: this.schoolSite!
      }).single();

      if (error) {
        await this.loadDataParallel();
      } else {
        this.processBatchData(data);
      }

      // SPE-287: load cross-provider sessions regardless of which path above ran (the
      // batch RPC does not include them). Best-effort — never blocks the main load.
      await this.loadCrossProviderSessions();

      // SPE-478: mainstreaming blocks, same shape — neither load path above
      // includes them, and unlike special activities (SPE-318) they are wired
      // into the scheduler from day one.
      await this.loadMainstreamingBlocks();

      // SPE-492: hand-entered protected times, same shape and posture.
      await this.loadStudentBlockedTimes();

      // SPE-513: push-in service times, same shape and posture.
      await this.loadStudentPushInTimes();

      this.cacheMetadata.lastFetched = new Date();
      this.cacheMetadata.isStale = false;
      this.cacheMetadata.queryCount++;
      
      const elapsed = performance.now() - startTime;
      this.metrics.queryTimes.push(elapsed);
      this.metrics.totalQueries++;
      
    } catch (error) {
      console.error('[DataManager] Failed to load data:', error);
      this.cacheMetadata.fetchErrors.push(error instanceof Error ? error.message : 'Unknown error');
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
   * Fetch rows for the current school from a table keyed by school_id, with a
   * fallback for rows the school_id migration never reached.
   *
   * SPE-463: this used to be either/or — school_id when we had one, otherwise
   * school_site. That is a trap in both directions, because production holds
   * both shapes at once:
   *
   *   - Bancroft / Mt. Diablo / Rodeo Hills: school_id set, school_site NULL
   *   - Walnut Acres: school_site set, school_id NULL (60 bell schedule rows,
   *     17 special activities) while its students all carry a school_id
   *
   * So filtering by only one key silently loads nothing for whichever set it
   * skips — and "nothing" here means the auto-scheduler happily books over
   * lunch. Match both: rows carrying this school_id, plus legacy rows that
   * carry no school_id but name this school.
   *
   * Two queries rather than a single `.or(...)`, deliberately: school names
   * contain characters that are significant in PostgREST's filter grammar
   * ("Mt. Diablo Elementary"), and a mis-escaped filter fails into an empty
   * result — reintroducing exactly this bug, silently.
   *
   * SPE-458: both passes are also scoped to the current school year. Without
   * it, conflict detection unioned every year a school had ever stored, so a
   * period retimed or removed for the new year kept blocking slots from last
   * year's row — a schedule nobody can see in the app still blocking
   * scheduling. Safe to filter unconditionally: the column is NOT NULL on both
   * tables, defaulted to current_school_year(), so there are no unlabelled
   * rows for an .eq() to strand.
   *
   * Two things this does NOT cover, both tracked separately — do not read this
   * filter as meaning the whole app is year-scoped:
   *
   *   - The provider Bell Schedules / Special Activities settings pages pin to
   *     getCurrentSchoolYear(), but the schedule GRID
   *     (use-schedule-data.ts) and the drag-time conflict checks in
   *     session-update-service.ts both still read every year at once. Until
   *     those are scoped too, a school holding two years can see the grid
   *     shade a slot this scheduler considers free.
   *   - A school whose rows were never carried forward into the new year now
   *     loads ZERO periods rather than last year's. That is the honest
   *     reading of the data, and it matches what the settings pages already
   *     show — but "no bell schedules" means nothing is protected, so the
   *     empty case is logged below rather than passing silently.
   */
  private async fetchForSchool<T>(
    table: 'bell_schedules' | 'special_activities',
    label: string,
  ): Promise<T[]> {
    const rows: T[] = [];
    // SPE-468: special_activities soft-deletes; every other reader filters
    // deleted rows out and the scheduler must too — a deleted activity must
    // never keep protecting a slot. bell_schedules has no deleted_at column.
    const liveOnly = table === 'special_activities';

    if (this.schoolId) {
      let query = this.supabase
        .from(table)
        .select('*')
        .eq('school_year', this.schoolYear)
        .eq('school_id', this.schoolId);
      if (liveOnly) {
        query = query.is('deleted_at', null);
      }
      const { data, error } = await query;

      if (error) {
        this.cacheMetadata.fetchErrors.push(`${label}: ${error.message}`);
      } else if (data) {
        rows.push(...(data as T[]));
      }
    }

    if (this.schoolSite) {
      let query = this.supabase
        .from(table)
        .select('*')
        .eq('school_year', this.schoolYear)
        .eq('school_site', this.schoolSite);
      if (liveOnly) {
        query = query.is('deleted_at', null);
      }

      // When we already matched by school_id, this pass is only for strays the
      // migration missed — without this the two passes would double-count any
      // row carrying both.
      if (this.schoolId) {
        query = query.is('school_id', null);
      }

      const { data, error } = await query;

      if (error) {
        this.cacheMetadata.fetchErrors.push(`${label} (legacy school_site): ${error.message}`);
      } else if (data) {
        rows.push(...(data as T[]));
      }
    }

    // SPE-458: an empty year-scoped read is not an error, but it is the shape
    // of a school whose schedules were never carried into the new year — and
    // "no periods" means the auto-scheduler protects nothing, the same end
    // state as SPE-463. Loud in the log rather than silent, since no query
    // failed and fetchErrors would stay clean.
    if (rows.length === 0) {
      console.warn(
        `[DataManager] No ${label.toLowerCase()} found for ${this.schoolSite ?? this.schoolId} ` +
        `in ${this.schoolYear}. Nothing will be protected for this school — check the ` +
        `schedules were carried forward into the current school year.`,
      );
    }

    return rows;
  }

  /**
   * Fetch bell schedules
   */
  private async fetchBellSchedules(): Promise<BellSchedule[]> {
    return this.fetchForSchool<BellSchedule>('bell_schedules', 'Bell schedules');
  }
  
  /**
   * Fetch special activities
   */
  private async fetchSpecialActivities(): Promise<SpecialActivity[]> {
    return this.fetchForSchool<SpecialActivity>('special_activities', 'Special activities');
  }
  
  /**
   * Fetch existing sessions
   */
  private async fetchExistingSessions(): Promise<ScheduleSession[]> {
    // First, fetch students for this school to get their IDs
    // Prioritize school_id (normalized) over legacy school_site/school_district fields
    let studentQuery = this.supabase
      .from('students')
      .select('id')
      .eq('provider_id', this.providerId!);

    if (this.schoolId) {
      // Use normalized school_id when available
      studentQuery = studentQuery.eq('school_id', this.schoolId);
    } else {
      // Fallback to legacy fields for schools not yet migrated
      studentQuery = studentQuery
        .eq('school_site', this.schoolSite!)
        .eq('school_district', this.schoolDistrict!);
    }

    const { data: students, error: studentError } = await studentQuery;

    if (studentError) {
      this.cacheMetadata.fetchErrors.push(`Students fetch: ${studentError.message}`);
      return [];
    }

    const studentIds = students?.map(s => s.id) || [];

    // SPE-477: this cache holds the WEEKLY schedule — recurring templates only,
    // never the dated instances materialized from them.
    //
    // Every consumer wants templates and only templates:
    //   - the schedule page's own session fetch already scopes to
    //     `session_date IS NULL`, and merges this cache into that same list, so
    //     anything else here leaks a population the page never asked for;
    //   - the auto-scheduler builds the weekly grid, and filtered instances back
    //     out client-side after they broke it (SPE-474);
    //   - manual placement generates Mon–Fri slots and counts conflicts against
    //     them, where instances inflate every count the same way;
    //   - the undo snapshot restores the template schedule.
    //
    // Fetching them was also what made the 10,000-row cap a real ceiling:
    // instances outrun templates roughly 40:1 (the largest provider in prod
    // carried 7,868 instances against 203 templates — 8,071 rows, 81% of the
    // cap, growing every week as the horizon rolls). Scoped to templates that
    // provider reads 203 rows, so the cap stops being a deadline.
    //
    // `session_date IS NULL` is the template test the page's own query uses; it
    // agrees with `is_template = true` on every row in prod. SPE-474's
    // templates-first ordering is gone with it — it existed so arbitrary
    // truncation would drop instances rather than templates, which cannot arise
    // when instances are never fetched.

    // For specialist users, also fetch sessions assigned to them (even from other providers' students)
    let sessionsResult;
    if (this.providerRole && isSpecialistSourceRole(this.providerRole)) {
      // Fetch sessions where:
      // 1. Student belongs to this user (any sessions for my students)
      // 2. OR assigned to this user (sessions assigned to me, regardless of whose students)
      if (studentIds.length > 0) {
        // Use a high limit to avoid Supabase's default 1000 row limit
        sessionsResult = await this.supabase
          .from('schedule_sessions')
          .select('*')
          .or(`student_id.in.(${studentIds.join(',')}),assigned_to_specialist_id.eq.${this.providerId}`)
          .is('session_date', null)
          .is('deleted_at', null)
          .limit(10000);
      } else {
        // No students, only fetch assigned sessions
        sessionsResult = await this.supabase
          .from('schedule_sessions')
          .select('*')
          .eq('assigned_to_specialist_id', this.providerId!)
          .is('session_date', null)
          .is('deleted_at', null)
          .limit(10000);
      }

      // Filter assigned sessions to only include those for students at the current school
      if (!sessionsResult.error && sessionsResult.data) {
        const assignedSessionStudentIds = sessionsResult.data
          .filter(session => session.assigned_to_specialist_id === this.providerId && session.student_id && !studentIds.includes(session.student_id))
          .map(session => session.student_id!);

        if (assignedSessionStudentIds.length > 0) {
          // Fetch students from assigned sessions to check their school
          // Prioritize school_id over legacy fields
          let assignedStudentsQuery = this.supabase
            .from('students')
            .select('id')
            .in('id', assignedSessionStudentIds);

          if (this.schoolId) {
            assignedStudentsQuery = assignedStudentsQuery.eq('school_id', this.schoolId);
          } else {
            assignedStudentsQuery = assignedStudentsQuery
              .eq('school_site', this.schoolSite!)
              .eq('school_district', this.schoolDistrict!);
          }

          const { data: assignedStudentsCheck } = await assignedStudentsQuery;

          const validAssignedStudentIds = assignedStudentsCheck?.map(s => s.id) || [];

          // Filter sessions to only include valid assigned sessions
          sessionsResult.data = sessionsResult.data.filter(session =>
            (session.student_id && studentIds.includes(session.student_id)) || // My students
            (session.assigned_to_specialist_id === this.providerId && session.student_id && validAssignedStudentIds.includes(session.student_id)) // Assigned sessions from current school only
          );
        }
      }
    } else {
      // For non-specialist users, only fetch their own students' sessions
      if (studentIds.length === 0) {
        return [];
      }

      sessionsResult = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', this.providerId!)
        .in('student_id', studentIds)
        .is('session_date', null)
        .is('deleted_at', null)
        .limit(10000);
    }

    if (sessionsResult.error) {
      this.cacheMetadata.fetchErrors.push(`Existing sessions: ${sessionsResult.error.message}`);
      return [];
    }

    return sessionsResult.data || [];
  }

  /**
   * SPE-287: the provider's own student ids at the current school (school_id when available,
   * else legacy school_site/district). Scopes the batched cross-provider read.
   */
  private async fetchProviderStudentIds(): Promise<string[]> {
    let studentQuery = this.supabase
      .from('students')
      .select('id')
      .eq('provider_id', this.providerId!);

    if (this.schoolId) {
      studentQuery = studentQuery.eq('school_id', this.schoolId);
    } else {
      studentQuery = studentQuery
        .eq('school_site', this.schoolSite!)
        .eq('school_district', this.schoolDistrict!);
    }

    const { data, error } = await studentQuery;
    if (error) {
      this.cacheMetadata.fetchErrors.push(`Provider student ids: ${error.message}`);
      return [];
    }
    return (data || []).map((s: { id: string }) => s.id);
  }

  /**
   * SPE-287: load cross-provider template sessions for the provider's students at this
   * school, so the auto-scheduler can hard-avoid double-booking a shared child across
   * providers. ONE batched RPC (find_matching_provider_sessions_batch) reusing the SPE-290
   * shared matcher — never a per-student call. Best-effort: on error the map stays empty
   * (scheduler falls back to today's own-provider-only behavior) and the error is recorded.
   */
  private async loadCrossProviderSessions(): Promise<void> {
    this.crossProviderSessions.clear();
    try {
      const studentIds = await this.fetchProviderStudentIds();
      if (studentIds.length === 0) return;

      const { data, error } = await this.supabase.rpc('find_matching_provider_sessions_batch', {
        p_student_ids: studentIds,
      });

      if (error) {
        this.cacheMetadata.fetchErrors.push(`Cross-provider sessions: ${error.message}`);
        return;
      }

      (data || []).forEach((row: {
        source_student_id: string;
        day_of_week: number | null;
        start_time: string | null;
        end_time: string | null;
        provider_role: string | null;
      }) => {
        const list = this.crossProviderSessions.get(row.source_student_id) ?? [];
        list.push({
          day_of_week: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time,
          provider_role: row.provider_role,
        });
        this.crossProviderSessions.set(row.source_student_id, list);
      });

    } catch (e) {
      this.cacheMetadata.fetchErrors.push(`Cross-provider sessions: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  /**
   * SPE-478: load every mainstreaming block at this school for the current
   * school year. Best-effort like the cross-provider loader: on error the
   * list stays empty (the scheduler simply doesn't know about protected time)
   * and the error is recorded. Requires school_id — the table has no legacy
   * school_site column, so non-migrated schools scope to the provider's own
   * blocks, which is also all they could have created.
   */
  private async loadMainstreamingBlocks(): Promise<void> {
    this.mainstreamingBlocks = [];
    try {
      // Blocks require a school_id (NOT NULL), so a non-migrated school can
      // never own any — and a provider-scoped fallback would import the
      // caller's blocks from their OTHER, migrated schools and wrongly
      // hard-avoid slots here (self-review on PR #856). Legacy = none.
      if (!this.schoolId) {
        return;
      }
      const { data, error } = await this.supabase
        .from('mainstreaming_blocks')
        .select('*')
        .eq('school_year', this.schoolYear)
        .eq('school_id', this.schoolId);
      if (error) {
        this.cacheMetadata.fetchErrors.push(`Mainstreaming blocks: ${error.message}`);
        return;
      }

      this.mainstreamingBlocks = data || [];
    } catch (e) {
      this.cacheMetadata.fetchErrors.push(`Mainstreaming blocks: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  /**
   * SPE-492: load every protected time at this school for the current school
   * year. Mirrors loadMainstreamingBlocks in every respect, including the
   * legacy-school rule (no school_id -> none can exist).
   */
  private async loadStudentBlockedTimes(): Promise<void> {
    this.studentBlockedTimes = [];
    try {
      if (!this.schoolId) {
        return;
      }
      const { data, error } = await this.supabase
        .from('student_blocked_times')
        .select('*')
        .eq('school_year', this.schoolYear)
        .eq('school_id', this.schoolId);
      if (error) {
        this.cacheMetadata.fetchErrors.push(`Blocked times: ${error.message}`);
        return;
      }

      this.studentBlockedTimes = data || [];
    } catch (e) {
      this.cacheMetadata.fetchErrors.push(`Blocked times: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  /**
   * SPE-513: load every PUSH-IN service time at this school for the current
   * school year. Mirrors loadStudentBlockedTimes in every respect, including
   * the legacy-school rule (no school_id -> none can exist). Entries are
   * period-anchored; the scheduler resolves them against its bell rows.
   */
  private async loadStudentPushInTimes(): Promise<void> {
    this.studentPushInTimes = [];
    try {
      if (!this.schoolId) {
        return;
      }
      const { data, error } = await this.supabase
        .from('student_service_times')
        .select('*')
        .eq('school_year', this.schoolYear)
        .eq('school_id', this.schoolId)
        .eq('setting', 'push_in');
      if (error) {
        this.cacheMetadata.fetchErrors.push(`Push-in times: ${error.message}`);
        return;
      }

      this.studentPushInTimes = data || [];
    } catch (e) {
      this.cacheMetadata.fetchErrors.push(`Push-in times: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
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
      // grade_level is a comma list ("1,2,3"; secondary rows are the whole
      // span, e.g. "6,7,8" — SPE-491). Index under EVERY member: keying by
      // the raw string made multi-grade rows unfindable, since lookups ask
      // for a single grade (every other consumer splits on commas too).
      const gradeKeys = (schedule.grade_level || '').split(',').map(g => g.trim()).filter(Boolean);
      for (const gradeKey of gradeKeys) {
        if (!this.data.data.bellSchedules.has(gradeKey)) {
          this.data.data.bellSchedules.set(gradeKey, new Map());
        }

        const dayMap = this.data.data.bellSchedules.get(gradeKey)!;
        if (!dayMap.has(schedule.day_of_week)) {
          dayMap.set(schedule.day_of_week, []);
        }

        dayMap.get(schedule.day_of_week)!.push(schedule);
      }
    });
  }
  
  /**
   * Cache special activities by teacher and day
   */
  private cacheSpecialActivities(activities: SpecialActivity[]): void {
    this.data.data.specialActivities.clear();
    // SPE-318: keep the flat list too — the auto-scheduler builds its own
    // per-teacher index from it (same shape it uses for mainstreaming blocks).
    this.specialActivitiesFlat = activities;

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
   * SPE-287: cross-provider template sessions per owned student (studentId -> the other
   * provider's sessions for the same shared child). Consumed by the auto-scheduler to
   * hard-avoid double-booking. Only shared students have entries.
   */
  public getCrossProviderSessions(): Map<string, OtherProviderSessionLite[]> {
    return this.crossProviderSessions;
  }

  /** SPE-478: every mainstreaming block at this school (current year). */
  public getMainstreamingBlocks(): MainstreamingBlock[] {
    return this.mainstreamingBlocks;
  }

  /** SPE-492: every protected time at this school (current year). */
  public getStudentBlockedTimes(): StudentBlockedTime[] {
    return this.studentBlockedTimes;
  }

  /** SPE-513: every push-in service time at this school (current year). */
  public getStudentPushInTimes(): StudentServiceTime[] {
    return this.studentPushInTimes;
  }

  /** SPE-318: every live special activity at this school (current year), flat. */
  public getSpecialActivitiesFlat(): SpecialActivity[] {
    return this.specialActivitiesFlat;
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
    
  }
  
  /**
   * Refresh all cached data
   */
  public async refresh(): Promise<void> {
    if (!this.providerId || !this.schoolSite) {
      throw new Error('DataManager not initialized');
    }
    
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
    this.crossProviderSessions.clear();
    this.mainstreamingBlocks = [];
    this.studentBlockedTimes = [];
    this.studentPushInTimes = [];
    this.specialActivitiesFlat = [];

    this.cacheMetadata.isStale = true;
    this.conflicts = [];

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