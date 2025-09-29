import { createClient } from '@/lib/supabase/client';
import { type SchoolIdentifier } from '@/lib/school-helpers';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database, SchoolHour } from '../../../src/types/database';

type SchoolHoursInput = Database['public']['Tables']['school_hours']['Insert'];

/**
 * Get school hours for the current user and school.
 * Uses intelligent filtering based on available school identifiers.
 */
export async function getSchoolHours(school?: SchoolIdentifier): Promise<SchoolHour[]> {
  const supabase = createClient<Database>();
  const queryType = school?.school_id ? 'indexed' : 'text-based';
  
  console.log('[getSchoolHours] Using', queryType, 'query strategy');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const perf = measurePerformanceWithAlerts('fetch_school_hours', 'database');
  
  let query = supabase
    .from('school_hours')
    .select('*')
    .eq('provider_id', user.id);

  // Apply school filter - only use school_site since school_district was removed
  if (school) {
    if (school.school_site) {
      query = query.eq('school_site', school.school_site);
    }
    // Note: school_district column has been removed from the table
  }

  const { data, error } = await query
    .order('day_of_week')
    .order('grade_level');

  perf.end({ 
    success: !error,
    metadata: { queryType, recordCount: data?.length || 0 }
  });

  if (error) throw error;
  return data || [];
}

/**
 * Upsert school hours (insert or update).
 * Stores both structured and text-based school identifiers.
 */
export async function upsertSchoolHours(
  hours: Omit<SchoolHoursInput, 'id' | 'created_at' | 'updated_at' | 'provider_id'> & Partial<SchoolIdentifier>
) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Validate required fields for the unique constraint
  if (!hours.school_site) {
    throw new Error('school_site is required for school hours');
  }
  if (hours.day_of_week === undefined || hours.day_of_week === null) {
    throw new Error('day_of_week is required for school hours');
  }
  if (!hours.grade_level) {
    throw new Error('grade_level is required for school hours');
  }

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

  if (error) {
    console.error('Error upserting school hours:', error);
    throw error;
  }
  return data;
}

/**
 * Delete school hours for a specific grade level.
 * Supports both structured and text-based school filtering.
 */
export async function deleteSchoolHours(gradeLevel: string, school?: SchoolIdentifier) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const perf = measurePerformanceWithAlerts('delete_school_hours', 'database');
  
  let query = supabase
    .from('school_hours')
    .delete()
    .eq('provider_id', user.id)
    .eq('grade_level', gradeLevel);

  // Apply school filter - only use school_site since school_district was removed
  if (school) {
    if (school.school_site) {
      query = query.eq('school_site', school.school_site);
    }
    // Note: school_district column has been removed from the table
  }

  const { error } = await query;
  
  perf.end({ success: !error });
  
  if (error) throw error;
}

/**
 * Clean up orphaned K schedules (when K checkbox is unchecked but data exists).
 * Deletes K, K-AM, and K-PM schedules.
 */
export async function cleanupKindergartenSchedules(school?: SchoolIdentifier) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const kGradeLevels = ['K', 'K-AM', 'K-PM'];
  
  for (const gradeLevel of kGradeLevels) {
    await deleteSchoolHours(gradeLevel, school);
  }
}

/**
 * Clean up orphaned TK schedules (when TK checkbox is unchecked but data exists).
 * Deletes TK, TK-AM, and TK-PM schedules.
 */
export async function cleanupTKSchedules(school?: SchoolIdentifier) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const tkGradeLevels = ['TK', 'TK-AM', 'TK-PM'];
  
  for (const gradeLevel of tkGradeLevels) {
    await deleteSchoolHours(gradeLevel, school);
  }
}