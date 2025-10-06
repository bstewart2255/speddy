import { createClient } from '@/lib/supabase/client';

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
  currentSchool?: { school_id?: string } | null;
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
    if (userRole === 'sea') {
      // For SEAs, use the RPC function to get only assigned students
      // SECURITY: Function uses auth.uid() internally, no user ID parameter needed
      const { data, error } = await supabase.rpc('get_sea_students');

      if (error) {
        console.error('Error loading SEA students:', error);

        // Provide helpful error message if function doesn't exist
        if (error.message?.includes('function') || error.code === '42883') {
          console.error(
            'Database function "get_sea_students" not found. ' +
            'Please run the migration: supabase/migrations/20251006_add_sea_students_function.sql'
          );
        }

        return { data: null, error };
      }

      // Transform and normalize the data to match the expected format
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

      // Filter by school if specified
      if (currentSchool?.school_id) {
        const filtered = transformedData.filter(
          (s: StudentData) => s.school_id === currentSchool.school_id
        );
        return { data: filtered, error: null };
      }

      return { data: transformedData, error: null };
    } else {
      // For non-SEA roles, use the standard query
      let query = supabase
        .from('students')
        .select(
          includeIEPGoals
            ? 'id, initials, grade_level, school_id, student_details(iep_goals)'
            : 'id, initials, grade_level, school_id'
        )
        .eq('provider_id', userId)
        .order('initials');

      // Filter by current school if available
      if (currentSchool?.school_id) {
        query = query.eq('school_id', currentSchool.school_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading provider students:', error);
        return { data: null, error };
      }

      return { data: data as StudentData[], error: null };
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
