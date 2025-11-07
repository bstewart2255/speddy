import { createClient } from '@/lib/supabase/client';
import type { Database } from '../../../src/types/database';

type UserSiteSchedule = Database['public']['Tables']['user_site_schedules']['Row'];
type UserSiteScheduleInsert = Database['public']['Tables']['user_site_schedules']['Insert'];

export async function getUserSiteSchedules(userId: string) {
  const supabase = createClient<Database>();

  const { data, error } = await supabase
    .from('user_site_schedules')
    .select(`
      *,
      provider_schools!inner(
        id,
        school_site,
        school_district
      )
    `)
    .eq('user_id', userId)
    .order('day_of_week');

  if (error) throw error;
  return data;
}

export async function setUserSiteSchedule(
  userId: string,
  siteId: string,
  daysOfWeek: number[]
) {
  const supabase = createClient<Database>();

  // First, delete existing schedules for this user/site combination
  const { error: deleteError } = await supabase
    .from('user_site_schedules')
    .delete()
    .eq('user_id', userId)
    .eq('site_id', siteId);

  if (deleteError) throw deleteError;

  // Then insert new schedules
  if (daysOfWeek.length > 0) {
    const schedules: UserSiteScheduleInsert[] = daysOfWeek.map(day => ({
      user_id: userId,
      site_id: siteId,
      day_of_week: day
    }));

    const { error: insertError } = await supabase
      .from('user_site_schedules')
      .insert(schedules);

    if (insertError) throw insertError;
  }
}

export async function clearUserSiteSchedules(userId: string) {
  const supabase = createClient<Database>();

  const { error } = await supabase
    .from('user_site_schedules')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Get the school(s) that a user works at on a specific day of the week.
 *
 * @param userId - The user's ID
 * @param dayOfWeek - Day of week (1=Monday, 2=Tuesday, ..., 5=Friday, 0=Weekend)
 * @returns Array of provider_schools records for the specified day, or empty array if none
 */
export async function getSchoolsForDay(userId: string, dayOfWeek: number) {
  const supabase = createClient<Database>();

  // If weekend (0), return empty array
  if (dayOfWeek === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_site_schedules')
    .select(`
      provider_schools!inner(
        id,
        provider_id,
        school_id,
        district_id,
        state_id,
        school_site,
        school_district,
        is_primary
      )
    `)
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek);

  if (error) throw error;

  // Extract the provider_schools data from the nested structure
  // Each item has a provider_schools property that could be an object or array
  return data?.map((item: any) => {
    // Handle both single object and array cases
    const school = item.provider_schools;
    return Array.isArray(school) ? school[0] : school;
  }).filter(Boolean) || [];
}