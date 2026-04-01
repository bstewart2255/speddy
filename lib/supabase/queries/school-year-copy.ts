import { createClient } from '@/lib/supabase/client';

/**
 * Check if a school year already has schedule data for a school.
 */
export async function checkYearHasData(
  schoolId: string,
  schoolYear: string
): Promise<boolean> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { count, error } = await supabase
    .from('bell_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('school_year', schoolYear);

  if (error) {
    throw error;
  }

  if (count && count > 0) return true;

  // Also check special_activities
  const { count: activityCount, error: activityError } = await supabase
    .from('special_activities')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('school_year', schoolYear)
    .is('deleted_at', null);

  if (activityError) {
    throw activityError;
  }

  return (activityCount ?? 0) > 0;
}

/**
 * Copy all schedule data from one school year to another via database RPC.
 * Runs in a single transaction for atomicity.
 */
export async function copyScheduleToNextYear(
  schoolId: string,
  fromYear: string,
  toYear: string
): Promise<{ bell_schedules: number; special_activities: number; activity_type_availability: number; rotation_pairs: number; rotation_groups: number; rotation_group_members: number }> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase.rpc('copy_schedule_to_year', {
    p_school_id: schoolId,
    p_from_year: fromYear,
    p_to_year: toYear,
  });

  if (error) {
    console.error('Error copying schedule to next year:', error);
    throw new Error(error.message || 'Failed to copy schedule');
  }

  return data;
}
