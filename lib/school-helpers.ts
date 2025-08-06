import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper functions for handling dual school identification system
 * These functions provide a compatibility layer during the migration period
 */

export interface SchoolIdentifier {
  // Legacy text-based identifiers
  school_site?: string | null;
  school_district?: string | null;
  
  // New structured identifiers
  school_id?: string | null;
  district_id?: string | null;
  state_id?: string | null;
}

/**
 * Build a query filter for school-based queries that works with both systems
 */
export function buildSchoolFilter(
  query: any,
  school: SchoolIdentifier,
  tableAlias?: string
): any {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  
  if (school.school_id) {
    // Prefer ID-based matching when available
    return query.eq(`${prefix}school_id`, school.school_id);
  } else if (school.school_site && school.school_district) {
    // Fallback to text-based matching
    return query
      .eq(`${prefix}school_site`, school.school_site)
      .eq(`${prefix}school_district`, school.school_district);
  }
  
  return query;
}

/**
 * Check if two school identifiers refer to the same school
 */
export function isSameSchool(
  school1: SchoolIdentifier,
  school2: SchoolIdentifier
): boolean {
  // First try ID-based comparison
  if (school1.school_id && school2.school_id) {
    return school1.school_id === school2.school_id;
  }
  
  // If one has ID and the other doesn't, they might still be the same
  // This would require a database lookup, so for now we fall back to text
  
  // Text-based comparison
  if (school1.school_site && school2.school_site) {
    const site1 = normalizeSchoolName(school1.school_site);
    const site2 = normalizeSchoolName(school2.school_site);
    const district1 = normalizeSchoolName(school1.school_district || '');
    const district2 = normalizeSchoolName(school2.school_district || '');
    
    return site1 === site2 && district1 === district2;
  }
  
  return false;
}

/**
 * Normalize school names for comparison
 */
export function normalizeSchoolName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\b(the|of|and|&)\b/g, '');
}

/**
 * Get a display name for a school
 */
export function getSchoolDisplayName(school: SchoolIdentifier): string {
  if (!school.school_site) return 'Unknown School';
  
  if (school.school_district) {
    return `${school.school_site} (${school.school_district})`;
  }
  
  return school.school_site;
}

/**
 * Check if a user has been migrated to the new system
 */
export function isUserMigrated(school: SchoolIdentifier): boolean {
  return !!school.school_id;
}

/**
 * Build a composite key for school identification
 */
export function getSchoolKey(school: SchoolIdentifier): string {
  if (school.school_id) {
    return `id:${school.school_id}`;
  }
  
  if (school.school_site && school.school_district) {
    return `text:${school.school_district}:${school.school_site}`;
  }
  
  return 'unknown';
}

/**
 * Fetch team members using the appropriate matching strategy
 */
export async function fetchTeamMembers(
  supabase: SupabaseClient,
  userId: string,
  school: SchoolIdentifier
): Promise<any[]> {
  try {
    if (school.school_id) {
      // Use new v2 function for migrated users
      const { data, error } = await supabase.rpc('find_all_team_members_v2', {
        current_user_id: userId
      });
      
      if (error) throw error;
      return data || [];
    } else {
      // Use original function for unmigrated users
      const { data, error } = await supabase.rpc('find_all_team_members', {
        p_school_site: school.school_site,
        p_school_district: school.school_district,
        p_exclude_user_id: userId
      });
      
      if (error) throw error;
      return data || [];
    }
  } catch (error) {
    console.error('Error fetching team members:', error);
    return [];
  }
}

/**
 * Merge duplicate team members that might appear due to migration
 * (e.g., same person appearing with both ID and text matching)
 */
export function deduplicateTeamMembers(members: any[]): any[] {
  const seen = new Map<string, any>();
  
  for (const member of members) {
    // Use email as the unique identifier
    const key = member.email || member.id;
    
    if (!seen.has(key)) {
      seen.set(key, member);
    } else {
      // If we've seen this member, prefer the one with school_id (migrated)
      const existing = seen.get(key);
      if (!existing.school_id && member.school_id) {
        seen.set(key, member);
      }
    }
  }
  
  return Array.from(seen.values());
}