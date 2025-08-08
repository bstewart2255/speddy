import { createClient } from '@/lib/supabase/client';
import { SpecialActivity } from '../../../src/types/database';
import type { Database } from '../../../src/types/database';

/**
 * Retrieve all special activities belonging to the logged in provider.
 * @param schoolId - Optional school ID to filter activities
 */
export async function getSpecialActivities(schoolId?: string): Promise<SpecialActivity[]> {
  const supabase = createClient();
  
  // Get current user first - CRITICAL for security
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  let query = supabase
    .from('special_activities')
    .select('*')
    .eq('provider_id', user.id); // CRITICAL: Filter by provider_id
  
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
 * Delete a special activity by id after verifying ownership.
 */
export async function deleteSpecialActivity(id: string): Promise<void> {
  const supabase = createClient();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // CRITICAL: Double-check ownership before delete
  const { error } = await supabase
    .from('special_activities')
    .delete()
    .eq('id', id)
    .eq('provider_id', user.id); // CRITICAL: Ensure user owns this record

  if (error) {
    console.error('Error deleting special activity:', error);
    throw error;
  }
}

/**
 * Remove all activities for a specific teacher owned by the user.
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
    .delete()
    .eq('teacher_name', teacherName)
    .eq('provider_id', user.id); // CRITICAL: Filter by provider_id
  
  // Filter by school_id if provided
  if (schoolId) {
    query = query.eq('school_id', schoolId);
  }
  
  const { error } = await query;

  if (error) {
    console.error('Error deleting teacher activities:', error);
    throw error;
  }
}