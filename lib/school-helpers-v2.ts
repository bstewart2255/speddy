import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Simplified school helper functions for structured school system
 * All functions now use exact ID matching for optimal performance
 */

export interface SchoolIdentifier {
  school_id: string;
  district_id: string;
  state_id: string;
  
  // Display fields (populated from joins)
  school_name?: string;
  district_name?: string;
  state_name?: string;
}

/**
 * Build an optimized query filter for school-based queries
 */
export function buildSchoolFilter(
  query: any,
  schoolId: string,
  tableAlias?: string
): any {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return query.eq(`${prefix}school_id`, schoolId);
}

/**
 * Check if two users are in the same school
 */
export function isSameSchool(
  school1: SchoolIdentifier,
  school2: SchoolIdentifier
): boolean {
  return school1.school_id === school2.school_id;
}

/**
 * Get a display name for a school
 */
export function getSchoolDisplayName(school: SchoolIdentifier): string {
  if (school.school_name && school.district_name && school.state_id) {
    return `${school.school_name} (${school.district_name}, ${school.state_id})`;
  }
  return school.school_name || 'Unknown School';
}

/**
 * Build a unique key for school identification
 */
export function getSchoolKey(school: SchoolIdentifier): string {
  return `school:${school.school_id}`;
}

/**
 * Fetch team members using exact school matching
 */
export async function fetchTeamMembers(
  supabase: SupabaseClient,
  userId: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('find_all_team_members', {
      current_user_id: userId
    });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[School Helpers] Error fetching team members:', error);
    return [];
  }
}

/**
 * Get school statistics
 */
export async function getSchoolStatistics(
  supabase: SupabaseClient,
  schoolId: string
): Promise<{
  totalStaff: number;
  totalStudents: number;
  totalSessions: number;
  activeProviders: number;
} | null> {
  try {
    const { data, error } = await supabase.rpc('get_school_statistics', {
      user_school_id: schoolId
    });
    
    if (error) throw error;
    
    if (data && data[0]) {
      return {
        totalStaff: data[0].total_staff,
        totalStudents: data[0].total_students,
        totalSessions: data[0].total_sessions,
        activeProviders: data[0].active_providers,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[School Helpers] Error fetching school statistics:', error);
    return null;
  }
}

/**
 * Batch fetch school details for multiple school IDs
 */
export async function fetchSchoolDetails(
  supabase: SupabaseClient,
  schoolIds: string[]
): Promise<Map<string, SchoolIdentifier>> {
  const schoolMap = new Map<string, SchoolIdentifier>();
  
  if (schoolIds.length === 0) return schoolMap;
  
  try {
    const { data, error } = await supabase
      .from('schools')
      .select(`
        id,
        name,
        district:districts!inner(
          id,
          name,
          state:states!inner(
            id,
            name,
            abbreviation
          )
        )
      `)
      .in('id', schoolIds);
    
    if (error) throw error;
    
    data?.forEach(school => {
      const district = school.district as any;
      const state = district?.state as any;
      
      schoolMap.set(school.id, {
        school_id: school.id,
        district_id: district?.id,
        state_id: state?.abbreviation,
        school_name: school.name,
        district_name: district?.name,
        state_name: state?.name,
      });
    });
  } catch (error) {
    console.error('[School Helpers] Error fetching school details:', error);
  }
  
  return schoolMap;
}

/**
 * Check if a user has access to a specific school
 */
export async function userHasSchoolAccess(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', userId)
      .eq('school_id', schoolId)
      .single();
    
    return !error && !!data;
  } catch (error) {
    console.error('[School Helpers] Error checking school access:', error);
    return false;
  }
}