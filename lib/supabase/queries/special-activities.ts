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
  return addSpecialActivityInternal(activity, 'provider');
}

/**
 * Add a new special activity as a site admin.
 *
 * This variant differs from {@link addSpecialActivity} in that the activity is
 * created with `provider_id` set to `null` and `created_by_role` set to
 * `'site_admin'`, so the activity is owned/attributed to a site admin rather
 * than a provider, which affects subsequent ownership and permissions.
 */
export async function addSpecialActivityAsAdmin(
  activity: {
    teacher_id: string;
    teacher_name: string;
    activity_name: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    school_id: string;
  }
): Promise<SpecialActivity> {
  // Cast to satisfy the type - the internal function handles nulls appropriately
  const activityData = {
    ...activity,
    content_hash: null,
    created_by_id: null,
    created_by_role: 'site_admin',
    deleted_at: null,
    district_id: null,
    school_site: null,
    state_id: null,
    updated_at: null
  } as unknown as Omit<SpecialActivity, 'id' | 'created_at' | 'provider_id'> & { school_site?: string; school_id?: string };

  return addSpecialActivityInternal(activityData, 'site_admin');
}

/**
 * Internal function to add a special activity.
 */
async function addSpecialActivityInternal(
  activity: Omit<SpecialActivity, 'id' | 'created_at' | 'provider_id'> & { school_site?: string; school_id?: string },
  role: 'provider' | 'site_admin'
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
      provider_id: role === 'provider' ? user.id : null,
      created_by_id: user.id,
      created_by_role: role,
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
 * Soft delete a special activity by id as a site admin.
 * Site admins can delete any special activity at their school, not just ones they created.
 * @param id - The special activity ID to delete
 * @param schoolId - The school ID to verify admin access
 */
export async function deleteSpecialActivityAsAdmin(id: string, schoolId: string): Promise<void> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Verify user is a site admin for this school
  const { data: adminPerm, error: adminError } = await supabase
    .from('admin_permissions')
    .select('id')
    .eq('user_id', user.id)
    .eq('school_id', schoolId)
    .eq('role', 'site_admin')
    .single();

  if (adminError || !adminPerm) {
    throw new Error('You do not have site admin permission for this school');
  }

  // Verify the activity exists and belongs to this school
  const { data: existingActivity, error: fetchError } = await supabase
    .from('special_activities')
    .select('id, school_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existingActivity) {
    throw new Error('Activity not found or already deleted');
  }

  if (existingActivity.school_id !== schoolId) {
    throw new Error('Activity does not belong to your school');
  }

  // Soft delete the activity
  const { error } = await supabase
    .from('special_activities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) {
    console.error('Error soft-deleting special activity as admin:', error);
    throw error;
  }
}

/**
 * Update a special activity by id as a site admin.
 * Site admins can update any special activity at their school, not just ones they created.
 * @param id - The special activity ID to update
 * @param schoolId - The school ID to verify admin access
 * @param updates - The fields to update
 */
export async function updateSpecialActivityAsAdmin(
  id: string,
  schoolId: string,
  updates: {
    activity_name?: string;
    start_time?: string;
    end_time?: string;
  }
): Promise<SpecialActivity> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Verify user is a site admin for this school
  const { data: adminPerm, error: adminError } = await supabase
    .from('admin_permissions')
    .select('id')
    .eq('user_id', user.id)
    .eq('school_id', schoolId)
    .eq('role', 'site_admin')
    .single();

  if (adminError || !adminPerm) {
    throw new Error('You do not have site admin permission for this school');
  }

  // Verify the activity exists and belongs to this school
  const { data: existingActivity, error: fetchError } = await supabase
    .from('special_activities')
    .select('id, school_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existingActivity) {
    throw new Error('Activity not found');
  }

  if (existingActivity.school_id !== schoolId) {
    throw new Error('Activity does not belong to your school');
  }

  // Update the activity
  const { data, error } = await supabase
    .from('special_activities')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    console.error('Error updating special activity as admin:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Failed to update activity');
  }

  return data;
}

/**
 * Soft delete a special activity by id after verifying ownership.
 * Sets deleted_at timestamp instead of permanently deleting the record.
 * Supports both new records (created_by_id) and legacy records (provider_id).
 */
export async function deleteSpecialActivity(id: string): Promise<void> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // First, verify ownership by checking the activity
  const { data: existingActivity, error: fetchError } = await supabase
    .from('special_activities')
    .select('id, created_by_id, provider_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existingActivity) {
    throw new Error('Activity not found or already deleted');
  }

  // Check ownership: created_by_id matches, OR (created_by_id is null AND provider_id matches)
  const isOwner = existingActivity.created_by_id === user.id ||
    (!existingActivity.created_by_id && existingActivity.provider_id === user.id);

  if (!isOwner) {
    throw new Error('You do not have permission to delete this activity');
  }

  // Soft delete the activity
  const { error } = await supabase
    .from('special_activities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) {
    console.error('Error soft-deleting special activity:', error);
    throw error;
  }
}

/**
 * Update a special activity by id after verifying ownership.
 * Supports both new records (created_by_id) and legacy records (provider_id).
 */
export async function updateSpecialActivity(
  id: string,
  updates: {
    teacher_id?: string | null;
    teacher_name?: string;
    activity_name?: string;
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
  }
): Promise<SpecialActivity> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // First, verify ownership by checking the activity
  const { data: existingActivity, error: fetchError } = await supabase
    .from('special_activities')
    .select('id, created_by_id, provider_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existingActivity) {
    throw new Error('Activity not found');
  }

  // Check ownership: created_by_id matches, OR (created_by_id is null AND provider_id matches)
  const isOwner = existingActivity.created_by_id === user.id ||
    (!existingActivity.created_by_id && existingActivity.provider_id === user.id);

  if (!isOwner) {
    throw new Error('You do not have permission to edit this activity');
  }

  // Update the activity
  const { data, error } = await supabase
    .from('special_activities')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    console.error('Error updating special activity:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Failed to update activity');
  }

  return data;
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