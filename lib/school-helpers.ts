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

export type SchoolLevel = 'elementary' | 'secondary';

/**
 * Subset of school fields used to decide the elementary vs. secondary experience.
 */
export interface SchoolLevelInput {
  school_type?: string | null;
  grade_span_low?: string | null;
}

/**
 * Parse a grade-span code into a comparable numeric grade.
 * Pre-K / TK / Kindergarten map to 0; "1".."12" map to their number.
 * Returns null when the value can't be interpreted.
 */
export function parseGradeLevel(grade?: string | null): number | null {
  if (grade === null || grade === undefined) return null;
  const g = String(grade).trim().toUpperCase();
  if (g === '') return null;
  if (g === 'PK' || g === 'PREK' || g === 'PRE-K' || g === 'P') return 0;
  if (g === 'TK') return 0;
  if (g === 'K' || g === 'KG' || g === 'KN' || g === 'KINDERGARTEN') return 0;
  const n = parseInt(g, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Classify a school_type label as secondary (true), elementary (false), or
 * unknown (null, so the caller can fall back to grade span).
 *
 * Combined sites (K-8 / K-12) are treated as elementary by product decision —
 * they still run elementary-style scheduling for their lower grades.
 */
function classifyByType(schoolType?: string | null): boolean | null {
  if (!schoolType) return null;
  const t = schoolType.toLowerCase();

  // Combined / elementary labels → elementary experience.
  if (
    t.includes('k-12') || t.includes('k12') ||
    t.includes('k-8') || t.includes('k8') ||
    t.includes('elementary') || t.includes('primary')
  ) {
    return false;
  }

  // Secondary labels.
  if (
    t.includes('middle') || t.includes('junior') ||
    t.includes('high') || t.includes('senior') ||
    t.includes('secondary')
  ) {
    return true;
  }

  // 'Other' / unrecognized → defer to grade span.
  return null;
}

/**
 * Determine whether a school should use the secondary (middle/high) experience.
 *
 * Authority order (SPE-146):
 *   1. Explicit school_type selection (Elementary / Middle / High / K-8 / K-12).
 *   2. Fallback to grade span: grade_span_low >= grade 6 = secondary.
 *   3. Default to elementary (the app is elementary-first) when neither is set.
 *
 * The explicit selection always wins over the derived grade span so an admin's
 * intent is never silently overridden by a field whose primary job is the valid
 * grade range for student entry.
 */
export function isSecondarySchool(school?: SchoolLevelInput | null): boolean {
  if (!school) return false;

  const byType = classifyByType(school.school_type);
  if (byType !== null) return byType;

  const low = parseGradeLevel(school.grade_span_low);
  if (low !== null) return low >= 6;

  return false;
}

/**
 * Convenience wrapper returning the level label for the given school.
 */
export function getSchoolLevel(school?: SchoolLevelInput | null): SchoolLevel {
  return isSecondarySchool(school) ? 'secondary' : 'elementary';
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