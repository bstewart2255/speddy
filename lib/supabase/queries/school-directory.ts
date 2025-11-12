import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';

type Teacher = Database['public']['Tables']['teachers']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

// ============================================================================
// GET CURRENT USER'S SCHOOL ID
// ============================================================================

export async function getCurrentUserSchoolId(): Promise<string | null> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_school_id' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  // Check if user is an admin first
  const adminPermResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('school_id, district_id')
        .eq('admin_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { operation: 'get_admin_school_id', userId: user.id }
  );

  if (adminPermResult.data?.school_id) {
    return adminPermResult.data.school_id;
  }

  // If not admin, get from profile
  const profileResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'get_profile_school_id', userId: user.id }
  );

  if (profileResult.error || !profileResult.data) {
    return null;
  }

  return profileResult.data.school_id;
}

// ============================================================================
// GET ALL TEACHERS AT CURRENT USER'S SCHOOL
// ============================================================================

export async function getSchoolTeachers(schoolId?: string) {
  const supabase = createClient<Database>();

  // Use provided school_id or get current user's school
  const targetSchoolId = schoolId || await getCurrentUserSchoolId();

  if (!targetSchoolId) {
    throw new Error('No school ID found for current user');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_school_teachers', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          id,
          first_name,
          last_name,
          email,
          classroom_number,
          phone_number,
          school_id,
          school_site,
          account_id,
          created_by_admin,
          created_at,
          updated_at
        `)
        .eq('school_id', targetSchoolId)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });

      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_school_teachers',
      schoolId: targetSchoolId
    }
  );
  fetchPerf.end();

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}

// ============================================================================
// SEARCH TEACHERS BY NAME (FOR AUTOCOMPLETE)
// ============================================================================

export async function searchTeachers(searchTerm: string, schoolId?: string) {
  const supabase = createClient<Database>();

  // Use provided school_id or get current user's school
  const targetSchoolId = schoolId || await getCurrentUserSchoolId();

  if (!targetSchoolId) {
    throw new Error('No school ID found for current user');
  }

  const searchPerf = measurePerformanceWithAlerts('search_teachers', 'database');
  const searchResult = await safeQuery(
    async () => {
      // Escape special characters to prevent SQL injection
      const escapedTerm = searchTerm.replace(/[%_\\]/g, '\\$&');

      // Search by first name, last name, or email
      const { data, error } = await supabase
        .from('teachers')
        .select('id, first_name, last_name, email, classroom_number')
        .eq('school_id', targetSchoolId)
        .or(
          `first_name.ilike.%${escapedTerm}%,` +
          `last_name.ilike.%${escapedTerm}%,` +
          `email.ilike.%${escapedTerm}%`
        )
        .order('last_name', { ascending: true })
        .limit(20);  // Limit results for autocomplete

      if (error) throw error;
      return data;
    },
    {
      operation: 'search_teachers',
      schoolId: targetSchoolId,
      searchTerm
    }
  );
  searchPerf.end();

  if (searchResult.error) {
    throw searchResult.error;
  }

  return searchResult.data || [];
}

// ============================================================================
// GET TEACHER BY ID (WITH ACCOUNT INFO IF LINKED)
// ============================================================================

export async function getTeacherById(teacherId: string) {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_teacher_by_id', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles:account_id (
            id,
            email,
            full_name,
            role,
            created_at
          )
        `)
        .eq('id', teacherId)
        .single();

      if (error) throw error;
      return data;
    },
    { operation: 'fetch_teacher_by_id', teacherId }
  );
  fetchPerf.end();

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data;
}

// ============================================================================
// GET TEACHERS WITH STUDENTS COUNT (FOR DIRECTORY VIEW)
// ============================================================================

export async function getTeachersWithStudentCount(schoolId?: string) {
  const supabase = createClient<Database>();

  // Use provided school_id or get current user's school
  const targetSchoolId = schoolId || await getCurrentUserSchoolId();

  if (!targetSchoolId) {
    throw new Error('No school ID found for current user');
  }

  const fetchPerf = measurePerformanceWithAlerts('fetch_teachers_with_counts', 'database');

  // Get all teachers
  const teachers = await getSchoolTeachers(targetSchoolId);

  // Get student counts for each teacher
  const teachersWithCounts = await Promise.all(
    teachers.map(async (teacher) => {
      const countResult = await safeQuery(
        async () => {
          const { count, error } = await supabase
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacher.id);

          if (error) throw error;
          return count || 0;
        },
        { operation: 'count_teacher_students', teacherId: teacher.id }
      );

      return {
        ...teacher,
        student_count: countResult.data || 0
      };
    })
  );

  fetchPerf.end();

  return teachersWithCounts;
}

// ============================================================================
// GET TEACHER'S STUDENTS (FOR TEACHER DETAILS VIEW)
// ============================================================================

export async function getTeacherStudents(teacherId: string) {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_teacher_students', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          initials,
          grade_level,
          sessions_per_week,
          minutes_per_session,
          profiles:provider_id (
            full_name,
            role
          )
        `)
        .eq('teacher_id', teacherId)
        .order('grade_level', { ascending: true });

      if (error) throw error;
      return data;
    },
    { operation: 'fetch_teacher_students', teacherId }
  );
  fetchPerf.end();

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}

// ============================================================================
// FORMAT TEACHER NAME (HELPER)
// ============================================================================

export function formatTeacherName(teacher: Pick<Teacher, 'first_name' | 'last_name'>): string {
  if (!teacher.first_name) {
    return teacher.last_name;
  }
  return `${teacher.first_name} ${teacher.last_name}`;
}

// ============================================================================
// GET TEACHER DISPLAY TEXT FOR AUTOCOMPLETE
// ============================================================================

export function getTeacherDisplayText(
  teacher: Pick<Teacher, 'first_name' | 'last_name' | 'classroom_number'>
): string {
  const name = formatTeacherName(teacher);
  if (teacher.classroom_number) {
    return `${name} (Room ${teacher.classroom_number})`;
  }
  return name;
}
