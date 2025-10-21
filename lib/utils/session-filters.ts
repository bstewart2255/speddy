import { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/monitoring/logger';

export interface SchoolContext {
  school_id?: string;
  district_id?: string;
  school_site?: string;
}

export interface Session {
  student_id: string;
  [key: string]: any;
}

/**
 * Filters sessions by school context with graceful error handling
 *
 * @param supabase - Supabase client instance
 * @param sessions - Array of sessions to filter
 * @param currentSchool - Current school context with school_id, district_id, or school_site
 * @returns Filtered array of sessions that belong to the current school, or original sessions on error
 */
export async function filterSessionsBySchool<T extends Session>(
  supabase: SupabaseClient,
  sessions: T[],
  currentSchool: SchoolContext | null | undefined
): Promise<T[]> {
  if (!currentSchool || sessions.length === 0) {
    return sessions;
  }

  const schoolId = currentSchool.school_id;
  const districtId = currentSchool.district_id;

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

    // Graceful degradation: return original sessions on error
    if (error) {
      log.error('Failed to filter sessions by school_id', error, {
        schoolId,
        studentCount: studentIds.length
      });
      return sessions;
    }

    // Return filtered sessions if query succeeded
    const schoolStudentIds = new Set(studentsData?.map(s => s.id) || []);
    return sessions.filter(s => schoolStudentIds.has(s.student_id));
  } else if (districtId) {
    // Fall back to district_id if school_id not available
    const schoolSite = currentSchool.school_site;

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

    // Graceful degradation: return original sessions on error
    if (error) {
      log.error('Failed to filter sessions by district_id', error, {
        districtId,
        schoolSite,
        studentCount: studentIds.length
      });
      return sessions;
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
  }

  // No school_id or district_id - return all sessions
  return sessions;
}
