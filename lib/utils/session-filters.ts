import { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/monitoring/logger';
import type { SchoolInfo } from '@/app/components/providers/school-context';

// Re-export SchoolInfo as SchoolContext for backwards compatibility
export type SchoolContext = SchoolInfo;

export interface Session {
  student_id: string | null;
  [key: string]: any;
}

/**
 * Filters sessions by school context. FAILS CLOSED (SPE-141): if the
 * school-membership lookup errors, returns `[]` rather than the unfiltered
 * input, so a transient DB error can never leak another school's sessions. The
 * error is logged; callers render an empty schedule until the next load.
 *
 * @param supabase - Supabase client instance
 * @param sessions - Array of sessions to filter
 * @param currentSchool - Current school context with school_id, district_id, or school_site
 * @returns Sessions belonging to the current school; `[]` on any lookup error
 */
export async function filterSessionsBySchool<T extends Session>(
  supabase: SupabaseClient,
  sessions: T[],
  currentSchool: SchoolContext | null | undefined
): Promise<T[]> {
  if (!currentSchool || sessions.length === 0) {
    return sessions;
  }

  // Normalize null to undefined for consistent checks
  const schoolId = currentSchool.school_id ?? undefined;
  const districtId = currentSchool.district_id ?? undefined;
  const schoolSite = currentSchool.school_site ?? undefined;
  const schoolDistrict = currentSchool.school_district ?? undefined;

  // Dedupe student IDs before querying
  const studentIds = Array.from(new Set(
    sessions.map(s => s.student_id).filter(Boolean)
  ));

  if (studentIds.length === 0) {
    return sessions;
  }

  if (schoolId) {
    // Filter by school_id (most efficient) - push filtering to database
    const { data: studentsData, error } = await supabase
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .in('id', studentIds);

    // Fail closed: never return the unfiltered set on error — that would leak
    // other schools' sessions (SPE-141). Empty is safe; the error is logged.
    if (error) {
      log.error('Failed to filter sessions by school_id', error, {
        schoolId,
        studentCount: studentIds.length
      });
      return [];
    }

    // Return filtered sessions if query succeeded
    const schoolStudentIds = new Set(studentsData?.map(s => s.id) || []);
    return sessions.filter(s => schoolStudentIds.has(s.student_id));
  } else if (districtId) {
    // Fall back to district_id if school_id not available
    // Build query with district filter
    let query = supabase
      .from('students')
      .select('id, school_site')
      .eq('district_id', districtId)
      .in('id', studentIds);

    // Push school_site filter to database if available
    if (schoolSite) {
      query = query.eq('school_site', schoolSite);
    }

    const { data: studentsData, error } = await query;

    // Fail closed (SPE-141): an errored lookup must not leak other schools.
    if (error) {
      log.error('Failed to filter sessions by district_id', error, {
        districtId,
        schoolSite,
        studentCount: studentIds.length
      });
      return [];
    }

    // Since school_site filter was pushed to database (if provided),
    // we can directly use the results
    if (!schoolSite && studentsData && studentsData.length > 0) {
      // No school_site provided - returning all district students
      log.warn('Filtering by district without school_site - returning all district sessions', {
        districtId,
        studentCount: studentsData.length
      });
    }

    const schoolStudentIds = new Set(studentsData?.map(s => s.id) || []);
    return sessions.filter(s => schoolStudentIds.has(s.student_id));
  } else if (schoolSite) {
    // Legacy context: the selected school has no school_id/district_id, only
    // the site/district strings — scope by those, matching how legacy student
    // rows are keyed. Without this branch, legacy multi-school accounts get
    // no filtering at all.
    let query = supabase
      .from('students')
      .select('id')
      .eq('school_site', schoolSite)
      .in('id', studentIds);

    if (schoolDistrict) {
      query = query.eq('school_district', schoolDistrict);
    }

    const { data: studentsData, error } = await query;

    // Fail closed (SPE-141): an errored lookup must not leak other schools.
    if (error) {
      log.error('Failed to filter sessions by school_site', error, {
        schoolSite,
        schoolDistrict,
        studentCount: studentIds.length
      });
      return [];
    }

    const schoolStudentIds = new Set(studentsData?.map(s => s.id) || []);
    return sessions.filter(s => schoolStudentIds.has(s.student_id));
  }

  // No school identifiers at all - return all sessions
  return sessions;
}
