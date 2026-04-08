import { createClient } from '@/lib/supabase/client';

/**
 * Check if a school year has been activated for a school.
 * First checks the activated_school_years table, then falls back
 * to checking if the year already has schedule data (backward compat).
 */
export async function checkYearActivated(
  schoolId: string,
  schoolYear: string
): Promise<boolean> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Check activated_school_years table first
  const { count, error } = await supabase
    .from('activated_school_years')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('school_year', schoolYear);

  if (error) {
    console.warn('Error checking activated_school_years, falling back to data check:', error);
  }

  if (!error && count && count > 0) return true;

  // Fall back to checking if year already has data (backward compat)
  return checkYearHasData(schoolId, schoolYear);
}

/**
 * Mark a school year as activated for a school.
 * Idempotent — does nothing if already activated.
 */
export async function activateSchoolYear(
  schoolId: string,
  schoolYear: string
): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('activated_school_years')
    .upsert(
      { school_id: schoolId, school_year: schoolYear, activated_by: user.id },
      { onConflict: 'school_id,school_year', ignoreDuplicates: true }
    );

  if (error) {
    console.error('Error activating school year:', error);
    throw new Error(error.message || 'Failed to activate school year');
  }
}

/**
 * Check if a school year already has schedule data for a school.
 * Checks all tables that the copy function writes to.
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

  const checks = await Promise.all([
    supabase
      .from('bell_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('school_year', schoolYear),
    supabase
      .from('special_activities')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('school_year', schoolYear)
      .is('deleted_at', null),
    supabase
      .from('activity_type_availability')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('school_year', schoolYear),
    supabase
      .from('rotation_activity_pairs')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('school_year', schoolYear),
    supabase
      .from('yard_duty_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('school_year', schoolYear),
  ]);

  for (const result of checks) {
    if (result.error) throw result.error;
    if (result.count && result.count > 0) return true;
  }

  return false;
}

/**
 * Copy all schedule data from one school year to another via database RPC.
 * Runs in a single transaction for atomicity.
 */
export async function copyScheduleToNextYear(
  schoolId: string,
  fromYear: string,
  toYear: string
): Promise<{ bell_schedules: number; special_activities: number; activity_type_availability: number; rotation_pairs: number; rotation_groups: number; rotation_group_members: number; yard_duty_assignments: number }> {
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
