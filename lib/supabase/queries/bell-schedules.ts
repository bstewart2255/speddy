import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Insert'];

/**
 * Insert a new bell schedule for the authenticated provider.
 * @param schedule - Schedule details excluding metadata fields.
 * @returns The created bell schedule row.
 */
export async function addBellSchedule(schedule: Omit<BellSchedule, 'id' | 'created_at' | 'updated_at' | 'provider_id'> & { school_site?: string }) {
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
  let finalSchoolSite = schedule.school_site;

  if (!finalSchoolSite) {
    const profilePerf = measurePerformanceWithAlerts('fetch_profile_for_bell_schedule', 'database');
    const profileResult = await safeQuery(
      () => supabase
        .from('profiles')
        .select('school_site')
        .eq('id', user.id)
        .single(),
      { operation: 'fetch_profile_for_bell_schedule', userId: user.id }
    );
    profilePerf.end({ success: !profileResult.error });

    if (profileResult.data) {
      finalSchoolSite = profileResult.data.school_site;
    }
  }

  const insertPerf = measurePerformanceWithAlerts('add_bell_schedule', 'database');
  const insertResult = await safeQuery(
    () => supabase
      .from('bell_schedules')
      .insert([{
        ...schedule,
        provider_id: user.id,
        school_site: finalSchoolSite
      }])
      .select()
      .single(),
    { 
      operation: 'add_bell_schedule', 
      userId: user.id,
      gradeLevel: schedule.grade_level,
      dayOfWeek: schedule.day_of_week
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
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_bell_schedule' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  const deletePerf = measurePerformanceWithAlerts('delete_bell_schedule', 'database');
  const deleteResult = await safeQuery(
    () => supabase
      .from('bell_schedules')
      .delete()
      .eq('id', id)
      .eq('provider_id', user.id), // CRITICAL: Only delete if user owns this schedule
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
 */
export async function deleteGradeSchedules(gradeLevel: string) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_grade_schedules' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  const deletePerf = measurePerformanceWithAlerts('delete_grade_schedules', 'database');
  const deleteResult = await safeQuery(
    () => supabase
      .from('bell_schedules')
      .delete()
      .eq('grade_level', gradeLevel)
      .eq('provider_id', user.id),
    { 
      operation: 'delete_grade_schedules', 
      userId: user.id,
      gradeLevel 
    }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}

/**
 * Fetch all bell schedules owned by the current user ordered for display.
 */
export async function getBellSchedules(schoolSite?: string) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_bell_schedules' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_bell_schedules', 'database');
  const fetchResult = await safeQuery(
    () => {
      let query = supabase
        .from('bell_schedules')
        .select('*')
        .eq('provider_id', user.id);

      // Add school filter if provided
      if (schoolSite) {
        query = query.eq('school_site', schoolSite);
      }

      return query
        .order('grade_level', { ascending: true })
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
    },
    { 
      operation: 'fetch_bell_schedules', 
      userId: user.id,
      schoolSite 
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) throw fetchResult.error;
  return fetchResult.data || [];
}