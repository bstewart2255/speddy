import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';

/**
 * Interface for unmatched student records
 */
export interface UnmatchedStudent {
  student_id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
  school_site: string | null;
  school_district: string | null;
  school_id: string | null;
  created_at: string;
}

/**
 * Fetch students with teacher_name but no matching teacher_id.
 * Only accessible to site admins for schools they manage.
 *
 * These students need manual teacher assignment by a site administrator.
 */
export async function getUnmatchedStudentTeachers(schoolId?: string): Promise<UnmatchedStudent[]> {
  const supabase = createClient();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_unmatched_students' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('You must be logged in to view unmatched students');
  }

  const user = authResult.data.data.user;

  // Query the students table directly with the unmatched criteria
  // RLS policies will automatically filter to schools the admin manages
  const fetchResult = await safeQuery(
    async () => {
      let query = supabase
        .from('students')
        .select('id, initials, grade_level, teacher_name, school_site, school_district, school_id, created_at')
        .not('teacher_name', 'is', null)
        .neq('teacher_name', '')
        .is('teacher_id', null)
        .order('school_site', { ascending: true })
        .order('teacher_name', { ascending: true });

      // Optionally filter by specific school
      if (schoolId) {
        query = query.eq('school_id', schoolId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_unmatched_students',
      userId: user.id,
      schoolId
    }
  );

  if (fetchResult.error) {
    console.error('[getUnmatchedStudentTeachers] Query error:', fetchResult.error);
    throw fetchResult.error;
  }

  // Map to the UnmatchedStudent interface
  return (fetchResult.data || []).map(student => ({
    student_id: student.id,
    initials: student.initials,
    grade_level: student.grade_level,
    teacher_name: student.teacher_name || '',
    school_site: student.school_site,
    school_district: student.school_district,
    school_id: student.school_id,
    created_at: student.created_at
  }));
}

/**
 * Manually assign a teacher to a student.
 * Only accessible to site admins for schools they manage.
 *
 * @param studentId - ID of the student to update
 * @param teacherId - ID of the teacher to assign
 */
export async function assignTeacherToStudent(studentId: string, teacherId: string): Promise<void> {
  const supabase = createClient();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_assign_teacher' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('You must be logged in to assign teachers');
  }

  const updateResult = await safeQuery(
    async () => {
      const { error } = await supabase
        .from('students')
        .update({ teacher_id: teacherId })
        .eq('id', studentId);
      if (error) throw error;
      return null;
    },
    {
      operation: 'assign_teacher_to_student',
      studentId,
      teacherId
    }
  );

  if (updateResult.error) {
    throw new Error(`Failed to assign teacher: ${updateResult.error.message}`);
  }
}
