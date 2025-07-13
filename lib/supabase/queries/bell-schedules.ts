import { createClient } from '@/lib/supabase/client';
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get user's school if not provided
  let finalSchoolSite = schedule.school_site;

  if (!finalSchoolSite) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_site')
      .eq('id', user.id)
      .single();

    if (profile) {
      finalSchoolSite = profile.school_site;
    }
  }

  const { data, error } = await supabase
    .from('bell_schedules')
    .insert([{
      ...schedule,
      provider_id: user.id,
      school_site: finalSchoolSite
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Remove a bell schedule by id if it belongs to the current user.
 */
export async function deleteBellSchedule(id: string) {
  const supabase = createClient<Database>();

  // CRITICAL: Get current user to verify ownership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bell_schedules')
    .delete()
    .eq('id', id)
    .eq('provider_id', user.id); // CRITICAL: Only delete if user owns this schedule

  if (error) throw error;
}

/**
 * Delete all bell schedules for a given grade for the current user.
 */
export async function deleteGradeSchedules(gradeLevel: string) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bell_schedules')
    .delete()
    .eq('grade_level', gradeLevel)
    .eq('provider_id', user.id);

  if (error) throw error;
}

/**
 * Fetch all bell schedules owned by the current user ordered for display.
 */
export async function getBellSchedules(schoolSite?: string) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let query = supabase
    .from('bell_schedules')
    .select('*')
    .eq('provider_id', user.id);

  // Add school filter if provided
  if (schoolSite) {
    query = query.eq('school_site', schoolSite);
  }

  const { data, error } = await query
    .order('grade_level', { ascending: true })
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}