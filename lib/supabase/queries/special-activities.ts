import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { SpecialActivity } from '../../../src/types/database';

export async function getSpecialActivities(): Promise<SpecialActivity[]> {
  const supabase = createClientComponentClient();
  
  // Get current user first - CRITICAL for security
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('special_activities')
    .select('*')
    .eq('provider_id', user.id) // CRITICAL: Filter by provider_id
    .order('day_of_week')
    .order('start_time');

  if (error) {
    console.error('Error fetching special activities:', error);
    throw error;
  }

  return data || [];
}

export async function addSpecialActivity(
  activity: Omit<SpecialActivity, 'id' | 'created_at' | 'provider_id'>
): Promise<SpecialActivity> {
  const supabase = createClientComponentClient();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('special_activities')
    .insert({
      ...activity,
      provider_id: user.id // CRITICAL: Explicitly set provider_id
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding special activity:', error);
    throw error;
  }

  return data;
}

export async function deleteSpecialActivity(id: string): Promise<void> {
  const supabase = createClientComponentClient();
  
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

export async function deleteTeacherActivities(teacherName: string): Promise<void> {
  const supabase = createClientComponentClient();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('special_activities')
    .delete()
    .eq('teacher_name', teacherName)
    .eq('provider_id', user.id); // CRITICAL: Filter by provider_id

  if (error) {
    console.error('Error deleting teacher activities:', error);
    throw error;
  }
}

export async function getSpecialActivitiesByTeacher(
  teacherName: string
): Promise<SpecialActivity[]> {
  const supabase = createClientComponentClient();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('special_activities')
    .select('*')
    .eq('teacher_name', teacherName)
    .eq('provider_id', user.id) // CRITICAL: Filter by provider_id
    .order('day_of_week')
    .order('start_time');

  if (error) {
    console.error('Error fetching teacher activities:', error);
    throw error;
  }

  return data || [];
}