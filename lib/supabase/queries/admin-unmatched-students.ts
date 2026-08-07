import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { addTeacherLinkForStudent } from './student-teachers';

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

  // SPE-337: ADD a teacher, don't replace one. Overwriting `teacher_id` used to
  // be the only option because a student had exactly one teacher; now that a
  // student can have several, "assign this teacher" must not silently unassign
  // whoever else already teaches them. The insert is idempotent — the
  // (child_id, teacher_id) unique constraint makes a re-assign a no-op rather
  // than an error — and the SPE-334 dual-write keeps the legacy column in step.
  const updateResult = await safeQuery(
    async () => {
      await addTeacherLinkForStudent(supabase, studentId, teacherId);

      // The link alone does not clear the unmatched state. An unmatched row is
      // by definition `teacher_id IS NULL` with a hand-typed `teacher_name`,
      // and that is the one shape `student_teachers_mirror_legacy` refuses to
      // touch (SPE-334 protects the typed name because no link exists to
      // replace it with). So the row would keep its NULL and reappear in this
      // very list after a successful-looking assign.
      //
      // Guarded on `teacher_id IS NULL`: it resolves an unmatched row and does
      // nothing at all to a student who already has a teacher, which is what
      // keeps this an ADD rather than the replacement it used to be.
      const { error } = await supabase
        .from('students')
        .update({ teacher_id: teacherId })
        .eq('id', studentId)
        .is('teacher_id', null);
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
