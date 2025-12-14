import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { buildSchoolFilter, type SchoolIdentifier } from '@/lib/school-helpers';
import type { Database } from '../../../src/types/database';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Insert'];
type CreatorRole = 'provider' | 'site_admin';

/**
 * Insert a new bell schedule for the authenticated user.
 * Supports both providers and site admins creating schedules.
 * @param schedule - Schedule details including school identifiers.
 * @param creatorRole - Role of the creator: 'provider' (default) or 'site_admin'
 * @returns The created bell schedule row.
 */
export async function addBellSchedule(
  schedule: Omit<BellSchedule, 'id' | 'created_at' | 'updated_at' | 'provider_id' | 'created_by_id' | 'created_by_role'> & SchoolIdentifier,
  creatorRole: CreatorRole = 'provider'
) {
  const supabase = createClient<Database>();

  // CRITICAL: Get current user to set provider_id
  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_add_bell_schedule' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  // Get user's school if not provided
  let schoolData: SchoolIdentifier = {
    school_site: schedule.school_site,
    school_district: schedule.school_district,
    school_id: schedule.school_id,
    district_id: schedule.district_id,
    state_id: schedule.state_id
  };

  // If no school data provided, fetch from user profile
  if (!schoolData.school_site && !schoolData.school_id) {
    const profilePerf = measurePerformanceWithAlerts('fetch_profile_for_bell_schedule', 'database');
    const profileResult = await safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('school_site, school_district, school_id, district_id, state_id')
          .eq('id', user.id)
          .single();
        if (error) throw error;
        return data;
      },
      { operation: 'fetch_profile_for_bell_schedule', userId: user.id }
    );
    profilePerf.end({ success: !profileResult.error });

    if (profileResult.data) {
      schoolData = {
        school_site: profileResult.data.school_site,
        school_district: profileResult.data.school_district,
        school_id: profileResult.data.school_id,
        district_id: profileResult.data.district_id,
        state_id: profileResult.data.state_id
      };
    }
  }

  const insertPerf = measurePerformanceWithAlerts('add_bell_schedule', 'database');
  const insertResult = await safeQuery(
    async () => {
      // Build insert data with school_id and creator tracking
      const insertData = {
        ...schedule,
        provider_id: creatorRole === 'provider' ? user.id : null,
        school_id: schoolData.school_id || undefined,
        created_by_id: user.id,
        created_by_role: creatorRole,
      };

      const { data, error } = await supabase
        .from('bell_schedules')
        .insert([insertData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'add_bell_schedule',
      userId: user.id,
      creatorRole,
      gradeLevel: schedule.grade_level,
      dayOfWeek: schedule.day_of_week,
      schoolSite: schoolData.school_site,
      schoolId: schoolData.school_id,
      isMigrated: !!schoolData.school_id
    }
  );
  insertPerf.end({ success: !insertResult.error });

  if (insertResult.error) throw insertResult.error;
  return insertResult.data;
}


/**
 * Remove a bell schedule by id if it belongs to the current user.
 * Supports both new records (created_by_id) and legacy records (provider_id).
 * Only the creator can delete their own bell schedule.
 */
export async function deleteBellSchedule(id: string) {
  const supabase = createClient<Database>();

  // CRITICAL: Get current user to verify ownership
  const authResult = await safeQuery(
    async () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_bell_schedule' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  // First, fetch the schedule to verify ownership
  const fetchPerf = measurePerformanceWithAlerts('fetch_bell_schedule_for_delete', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('bell_schedules')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_bell_schedule_for_delete', scheduleId: id }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error || !fetchResult.data) {
    throw new Error('Bell schedule not found');
  }

  const schedule = fetchResult.data as {
    id: string;
    created_by_id: string | null;
    provider_id: string | null;
  };

  // Check ownership: created_by_id matches, OR (created_by_id is null AND provider_id matches)
  const isOwner = schedule.created_by_id === user.id ||
    (!schedule.created_by_id && schedule.provider_id === user.id);

  if (!isOwner) {
    throw new Error('You do not have permission to delete this bell schedule');
  }

  const deletePerf = measurePerformanceWithAlerts('delete_bell_schedule', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('bell_schedules')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return null;
    },
    {
      operation: 'delete_bell_schedule',
      userId: user.id,
      scheduleId: id
    }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}

/**
 * Delete all bell schedules for a given grade for the current user.
 * Supports both structured and text-based school filtering.
 */
export async function deleteGradeSchedules(
  gradeLevel: string, 
  school?: SchoolIdentifier
) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    async () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_grade_schedules' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  const deletePerf = measurePerformanceWithAlerts('delete_grade_schedules', 'database');
  const deleteResult = await safeQuery(
    async () => {
      let query = supabase
        .from('bell_schedules')
        .delete()
        .eq('grade_level', gradeLevel)
        .eq('provider_id', user.id);

      // Apply school filter using school_id only (text columns removed)
      if (school && school.school_id) {
        query = query.eq('school_id', school.school_id);
      }

      const { error } = await query;
      if (error) throw error;
      return null;
    },
    { 
      operation: 'delete_grade_schedules', 
      userId: user.id,
      gradeLevel,
      schoolSite: school?.school_site,
      schoolId: school?.school_id,
      isMigrated: !!school?.school_id
    }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}

/**
 * Fetch all bell schedules owned by the current user ordered for display.
 * Intelligently uses school_id for faster queries when available.
 */
export async function getBellSchedules(school?: SchoolIdentifier) {
  console.log('[getBellSchedules] Called with school:', school);
  const queryType = school?.school_id ? 'indexed' : 'text-based';
  console.log('[getBellSchedules] Using', queryType, 'query strategy');

  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    async () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_bell_schedules' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    console.error('[getBellSchedules] Not authenticated');
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;
  console.log('[getBellSchedules] User ID:', user.id);

  const fetchPerf = measurePerformanceWithAlerts('fetch_bell_schedules', 'database');
  const fetchResult = await safeQuery(
    async () => {
      let query = supabase
        .from('bell_schedules')
        .select('*')
        .eq('provider_id', user.id);

      // Apply school filter using school_id (now required after migration)
      if (school && school.school_id) {
        console.log('[getBellSchedules] Using school_id index for filtering');
        query = query.eq('school_id', school.school_id);
      } else if (school) {
        // If no school_id provided, we can't filter (columns removed)
        console.warn('[getBellSchedules] Cannot filter without school_id - text columns removed');
      }

      const { data, error } = await query
        .order('grade_level', { ascending: true })
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_bell_schedules', 
      userId: user.id,
      schoolSite: school?.school_site,
      schoolId: school?.school_id,
      queryType,
      isMigrated: !!school?.school_id
    }
  );
  fetchPerf.end({ 
    success: !fetchResult.error,
    metadata: { queryType, recordCount: fetchResult.data?.length || 0 }
  });

  if (fetchResult.error) {
    console.error('[getBellSchedules] Query error:', fetchResult.error);
    throw fetchResult.error;
  }

  console.log('[getBellSchedules] Results:', fetchResult.data?.length || 0, 'bell schedules found');

  // Add migration hint to results for UI display
  const results = fetchResult.data || [];
  if (school?.school_id && results.length > 0) {
    console.log('[getBellSchedules] Note: Using indexed queries would improve performance');
  }

  return results;
}

/**
 * Fetch ALL bell schedules for a school (for site admins).
 * Unlike getBellSchedules, this returns all schedules at the school, not just the current user's.
 * Includes creator information for display.
 * @param schoolId - The school ID to fetch schedules for
 * @returns Array of bell schedules with creator info
 */
export async function getBellSchedulesForSchool(schoolId: string) {
  console.log('[getBellSchedulesForSchool] Called with schoolId:', schoolId);

  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    async () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_school_bell_schedules' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    console.error('[getBellSchedulesForSchool] Not authenticated');
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;
  console.log('[getBellSchedulesForSchool] User ID:', user.id);

  const fetchPerf = measurePerformanceWithAlerts('fetch_school_bell_schedules', 'database');

  // Define type for bell schedule with creator columns
  type BellScheduleWithCreator = {
    id: string;
    grade_level: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    period_name: string | null;
    provider_id: string | null;
    school_id: string | null;
    created_by_id: string | null;
    created_by_role: string | null;
    created_at: string | null;
    updated_at: string | null;
  };

  const fetchResult = await safeQuery(
    async () => {
      // Fetch all bell schedules for the school
      // Note: creator join will work after migration is applied
      const { data, error } = await supabase
        .from('bell_schedules')
        .select('*')
        .eq('school_id', schoolId)
        .order('grade_level', { ascending: true })
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as BellScheduleWithCreator[];
    },
    {
      operation: 'fetch_school_bell_schedules',
      userId: user.id,
      schoolId
    }
  );
  fetchPerf.end({
    success: !fetchResult.error,
    metadata: { recordCount: fetchResult.data?.length || 0 }
  });

  if (fetchResult.error) {
    console.error('[getBellSchedulesForSchool] Query error:', fetchResult.error);
    throw fetchResult.error;
  }

  console.log('[getBellSchedulesForSchool] Results:', fetchResult.data?.length || 0, 'bell schedules found');

  // Get creator profiles for display (separate query to avoid join issues during migration)
  const creatorIds = [...new Set((fetchResult.data || [])
    .map(s => s.created_by_id || s.provider_id)
    .filter(Boolean))] as string[];

  let creatorMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', creatorIds);

    if (profiles) {
      creatorMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));
    }
  }

  // Transform results to include creator name and ownership flag
  const results = (fetchResult.data || []).map(schedule => {
    const creatorId = schedule.created_by_id || schedule.provider_id;
    return {
      ...schedule,
      creator_name: creatorId ? (creatorMap[creatorId] || 'Unknown') : 'Unknown',
      is_owner: schedule.created_by_id === user.id ||
        (!schedule.created_by_id && schedule.provider_id === user.id)
    };
  });

  return results;
}