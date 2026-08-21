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
 * Provider roles that schedule discrete pull-out sessions even at secondary
 * (middle/high) schools — the related services (SPE-490, JSUSD evidence
 * 2026-08-13). `resource` is deliberately absent: secondary resource service
 * is embedded in class periods and planned as a weekly minutes bucket
 * (shouldUseWeeklyBucket), not as scheduled sessions.
 */
export const SECONDARY_SCHEDULING_ROLES = [
  'speech',
  'ot',
  'counseling',
  'psychologist',
] as const;

/**
 * Whether this provider role keeps the scheduling surfaces (Schedule, Bell
 * Schedules, Plan, session fields) when the active school is secondary.
 */
export function canScheduleAtSecondary(role?: string | null): boolean {
  return (SECONDARY_SCHEDULING_ROLES as readonly string[]).includes(
    (role || '').trim()
  );
}

/**
 * The grade list a secondary school's bell schedule covers (SPE-491).
 *
 * A secondary period grid applies to the whole school, not one grade — the
 * same bell rings for a 9th and a 12th grader — so entry writes ONE row per
 * day whose grade_level is this list comma-joined (every conflict matcher
 * already splits on commas). Derived from the school's grade span, clamped
 * to 6–12; falls back to the full 6–12 when the span is unset or unusable.
 */
export function getSecondaryGradeRange(
  school?: (SchoolLevelInput & { grade_span_high?: string | null }) | null
): string[] {
  const FULL_RANGE_LOW = 6;
  const FULL_RANGE_HIGH = 12;

  let low = parseGradeLevel(school?.grade_span_low);
  let high = parseGradeLevel(school?.grade_span_high);

  // Combined sites (K-8/K-12) classify as elementary, so a secondary school's
  // span low below 6 is dirty data — clamp rather than trust it.
  low = low === null ? FULL_RANGE_LOW : Math.max(low, FULL_RANGE_LOW);
  high = high === null ? FULL_RANGE_HIGH : Math.min(high, FULL_RANGE_HIGH);
  if (high < low) {
    low = FULL_RANGE_LOW;
    high = FULL_RANGE_HIGH;
  }

  const grades: string[] = [];
  for (let g = low; g <= high; g++) grades.push(String(g));
  return grades;
}

/**
 * The scheduling grades a school's UI should offer, in grade order (SPE-587).
 *
 * Secondary sites defer to `getSecondaryGradeRange` (6–12, clamped to the
 * span). Elementary sites derive from their own span, so a K-8 or K-12
 * combined site — classified elementary on purpose — offers its upper grades
 * instead of stopping at 5th. TK leads any span reaching kindergarten: spans
 * are recorded as K but TK students are entered against them.
 *
 * Falls back to TK–5 when the span is missing or unusable, matching the
 * elementary-first default the rest of the app takes (SPE-152). The high end
 * is capped at 12 so an unreadable span (SEIS writes codes like `17` — SPE-467)
 * can't produce grades outside `CANONICAL_GRADES`.
 */
export function getSchoolGradeRange(
  school?: (SchoolLevelInput & { grade_span_high?: string | null }) | null
): string[] {
  if (isSecondarySchool(school)) return getSecondaryGradeRange(school);

  const DEFAULT_LOW = 0; // TK / K
  const DEFAULT_HIGH = 5;
  const CANONICAL_HIGH = 12;

  const parsedLow = parseGradeLevel(school?.grade_span_low);
  const parsedHigh = parseGradeLevel(school?.grade_span_high);

  let low = parsedLow === null ? DEFAULT_LOW : Math.max(parsedLow, DEFAULT_LOW);
  let high = parsedHigh === null ? DEFAULT_HIGH : Math.min(parsedHigh, CANONICAL_HIGH);
  if (high < low) {
    low = DEFAULT_LOW;
    high = DEFAULT_HIGH;
  }

  const grades: string[] = [];
  if (low <= 0) grades.push('TK', 'K');
  for (let g = Math.max(low, 1); g <= high; g++) grades.push(String(g));
  return grades;
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