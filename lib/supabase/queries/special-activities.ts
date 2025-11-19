import { createClient } from '@/lib/supabase/client';
import { SpecialActivity } from '../../../src/types/database';
import type { Database } from '../../../src/types/database';

/**
 * Retrieve all special activities at schools where the provider has students.
 * @param schoolId - Optional school ID to filter activities
 */
export async function getSpecialActivities(schoolId?: string): Promise<SpecialActivity[]> {
  const supabase = createClient();

  // Get current user first - CRITICAL for security
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Query all activities at the school (teacher and provider created)
  // Exclude soft-deleted activities
  let query = supabase
    .from('special_activities')
    .select('*')
    .is('deleted_at', null);

  // Filter by school_id if provided
  if (schoolId) {
    query = query.eq('school_id', schoolId);
  }

  const { data, error } = await query
    .order('day_of_week')
    .order('start_time');

  if (error) {
    console.error('Error fetching special activities:', error);
    throw error;
  }

  return data || [];
}

/**
 * Add a new special activity for the current provider.
 */
export async function addSpecialActivity(
  activity: Omit<SpecialActivity, 'id' | 'created_at' | 'provider_id'> & { school_site?: string; school_id?: string }
): Promise<SpecialActivity> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Get user's school if not provided
  let finalSchoolSite = activity.school_site;
  let finalSchoolId = activity.school_id;

  if (!finalSchoolId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_site, school_id')
      .eq('id', user.id)
      .single();

    if (profile) {
      finalSchoolSite = finalSchoolSite || profile.school_site;
      finalSchoolId = profile.school_id;
    }
  }

  const { data, error } = await supabase
    .from('special_activities')
    .insert({
      ...activity,
      provider_id: user.id,
      created_by_id: user.id,
      created_by_role: 'provider',
      school_site: finalSchoolSite,
      school_id: finalSchoolId
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding special activity:', error);
    throw error;
  }

  return data;
}

/**
 * Soft delete a special activity by id after verifying ownership.
 * Sets deleted_at timestamp instead of permanently deleting the record.
 */
export async function deleteSpecialActivity(id: string): Promise<void> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // CRITICAL: Soft delete with ownership verification
  // Use created_by_id for ownership (works for both teacher and provider activities)
  const { data, error, count } = await supabase
    .from('special_activities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('created_by_id', user.id) // CRITICAL: Ensure user created this record
    .is('deleted_at', null) // Only delete if not already deleted
    .select('id', { count: 'exact' });

  if (error) {
    console.error('Error soft-deleting special activity:', error);
    throw error;
  }

  // Check if any rows were affected
  if (count === 0) {
    throw new Error('Activity not found, already deleted, or you do not have permission to delete it');
  }
}

/**
 * Soft delete all activities for a specific teacher created by the user.
 * @param teacherName - The teacher's name
 * @param schoolId - Optional school ID to scope the deletion
 */
export async function deleteTeacherActivities(teacherName: string, schoolId?: string): Promise<void> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  let query = supabase
    .from('special_activities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('teacher_name', teacherName)
    .eq('created_by_id', user.id) // CRITICAL: Filter by creator
    .is('deleted_at', null); // Only delete active records

  // Filter by school_id if provided
  if (schoolId) {
    query = query.eq('school_id', schoolId);
  }

  const { error } = await query;

  if (error) {
    console.error('Error soft-deleting teacher activities:', error);
    throw error;
  }
}