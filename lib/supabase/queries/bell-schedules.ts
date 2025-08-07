import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { buildSchoolFilter, type SchoolIdentifier } from '@/lib/school-helpers';
import type { Database } from '../../../src/types/database';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Insert'];

/**
 * Insert a new bell schedule for the authenticated provider.
 * Supports both structured (school_id) and text-based school identification.
 * @param schedule - Schedule details including school identifiers.
 * @returns The created bell schedule row.
 */
export async function addBellSchedule(
  schedule: Omit<BellSchedule, 'id' | 'created_at' | 'updated_at' | 'provider_id'> & SchoolIdentifier
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
      // Build insert data with school_id (required after migration)
      const insertData = {
        ...schedule,
        provider_id: user.id,
        school_id: schoolData.school_id || undefined,
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

  const deletePerf = measurePerformanceWithAlerts('delete_bell_schedule', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('bell_schedules')
        .delete()
        .eq('id', id)
        .eq('provider_id', user.id); // CRITICAL: Only delete if user owns this schedule
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