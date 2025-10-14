import { createClient } from '@/lib/supabase/client';
import type { SchoolInfo } from '@/app/components/providers/school-context';

export interface StudentData {
  id: string;
  initials: string;
  grade_level: string | number; // Database returns string, some components use number
  school_id?: string;
  provider_id?: string;
  iep_goals?: string[]; // Always normalized to array at top level
  student_details?: { iep_goals?: string[] }; // Optional nested format for compatibility
}

export interface LoadStudentsOptions {
  includeIEPGoals?: boolean;
  currentSchool?: SchoolInfo | null;
}

/**
 * Load students based on user role
 * - For SEAs: Returns only students assigned to them via schedule_sessions
 * - For other roles: Returns all students where provider_id matches
 */
export async function loadStudentsForUser(
  userId: string,
  userRole: string,
  options: LoadStudentsOptions = {}
): Promise<{ data: StudentData[] | null; error: any }> {
  const supabase = createClient();
  const { includeIEPGoals = false, currentSchool = null } = options;

  try {
    // Verify authentication before proceeding
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('[loadStudentsForUser] No valid session:', sessionError);
      return {
        data: null,
        error: sessionError || new Error('No active session. Please log in again.')
      };
    }

    console.log('[loadStudentsForUser] Valid session found for user:', session.user.id);

    if (userRole === 'sea') {
      // For SEAs, use the RPC function to get only assigned students
      // SECURITY: Function uses auth.uid() internally, no user ID parameter needed
      // Pass school_id for server-side filtering (null returns all schools)
      console.log('[loadStudentsForUser] Calling get_sea_students RPC with:', {
        p_school_id: currentSchool?.school_id || null,
        school_site: currentSchool?.school_site
      });

      const { data, error } = await supabase.rpc('get_sea_students', {
        p_school_id: currentSchool?.school_id || null
      });

      console.log('[loadStudentsForUser] RPC response:', {
        hasData: !!data,
        dataCount: Array.isArray(data) ? data.length : 'not-array',
        hasError: !!error,
        errorType: error ? typeof error : 'none',
        errorKeys: error ? Object.keys(error) : []
      });

      if (error) {
        console.error('Error loading SEA students:', {
          error,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          stringified: JSON.stringify(error)
        });

        // Provide helpful error message if function doesn't exist
        if (error.message?.includes('function') || error.code === '42883') {
          console.error(
            'Database function "get_sea_students" not found. ' +
            'Please run the migration: supabase/migrations/20251016_add_sea_students_function.sql'
          );
        }

        return { data: null, error };
      }

      // Transform and normalize the data to match the expected format
      // School filtering is handled server-side in the RPC function
      const transformedData = (data || []).map((student: any) => {
        const iepGoals = student.iep_goals || [];
        return {
          id: student.id,
          initials: student.initials,
          grade_level: student.grade_level,
          school_id: student.school_id,
          provider_id: student.provider_id,
          iep_goals: iepGoals, // Always provide at top level
          student_details: includeIEPGoals ? { iep_goals: iepGoals } : undefined,
        } as StudentData;
      });

      return { data: transformedData, error: null };
    } else {
      // For non-SEA roles, use the standard query
      let query = supabase
        .from('students')
        .select(
          includeIEPGoals
            ? 'id, initials, grade_level, school_id, provider_id, student_details(iep_goals)'
            : 'id, initials, grade_level, school_id, provider_id'
        )
        .eq('provider_id', userId)
        .order('initials');

      // Filter by current school if available
      // Use OR filter to include both:
      // 1. Students with matching school_id (migrated students)
      // 2. Students with NULL school_id (unmigrated students - fallback)
      if (currentSchool?.school_id) {
        query = query.or(`school_id.eq.${currentSchool.school_id},school_id.is.null`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading provider students:', error);
        return { data: null, error };
      }

      // Normalize the data structure to match the SEA path format
      const normalizedData = (data || []).map((student: any) => {
        // Extract IEP goals from student_details (handle both array and object formats)
        const studentDetails = Array.isArray(student.student_details)
          ? student.student_details[0]
          : student.student_details;
        const iepGoals = studentDetails?.iep_goals || [];

        return {
          id: student.id,
          initials: student.initials,
          grade_level: student.grade_level,
          school_id: student.school_id,
          provider_id: student.provider_id,
          iep_goals: iepGoals, // Always provide at top level
          student_details: includeIEPGoals ? { iep_goals: iepGoals } : undefined,
        } as StudentData;
      });

      return { data: normalizedData, error: null };
    }
  } catch (error) {
    console.error('Unexpected error loading students:', error);
    return { data: null, error };
  }
}

/**
 * Get user role from profiles table
 */
export async function getUserRole(userId: string): Promise<string | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user role:', error);
    return null;
  }

  return data?.role || null;
}
