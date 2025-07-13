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