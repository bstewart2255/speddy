import { createClient } from '@/lib/supabase/client';
import type { Database } from '../../../src/types/database';

type SchoolHours = Database['public']['Tables']['school_hours']['Insert'];

/**
 * Get school hours for the current user and school
 */
export async function getSchoolHours(schoolSite?: string) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let query = supabase
    .from('school_hours')
    .select('*')
    .eq('provider_id', user.id);

  if (schoolSite) {
    query = query.eq('school_site', schoolSite);
  }

  const { data, error } = await query
    .order('day_of_week')
    .order('grade_level');

  if (error) throw error;
  return data || [];
}

/**
 * Upsert school hours (insert or update)
 */
export async function upsertSchoolHours(hours: Omit<SchoolHours, 'id' | 'created_at' | 'updated_at' | 'provider_id'>) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('school_hours')
    .upsert({
      ...hours,
      provider_id: user.id,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'provider_id,school_site,day_of_week,grade_level'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete school hours for a specific grade level
 */
export async function deleteSchoolHours(gradeLevel: string, schoolSite?: string) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let query = supabase
    .from('school_hours')
    .delete()
    .eq('provider_id', user.id)
    .eq('grade_level', gradeLevel);

  if (schoolSite) {
    query = query.eq('school_site', schoolSite);
  }

  const { error } = await query;
  if (error) throw error;
}