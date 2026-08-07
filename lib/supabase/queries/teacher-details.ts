import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { getLinkedStudentIds } from './student-teachers';
import type { Database } from '../../../src/types/database';
import type { PostgrestError } from '@supabase/supabase-js';

type Teacher = Database['public']['Tables']['teachers']['Row'];
type Student = Database['public']['Tables']['students']['Row'];

export interface TeacherDetails extends Teacher {
  assigned_students: Array<{
    id: string;
    initials: string;
    grade_level: string;
    sessions_per_week: number;
    minutes_per_session: number;
  }>;
}

/**
 * Retrieves detailed information about a teacher including their assigned students.
 *
 * @param teacherId - UUID of the teacher to fetch
 * @returns TeacherDetails object with teacher info and assigned students, or null if not found
 * @throws Error if user is not authenticated or if database query fails
 *
 * @example
 * ```typescript
 * const teacher = await getTeacherDetails('teacher-uuid');
 * if (teacher) {
 *   console.log(`${teacher.first_name} has ${teacher.assigned_students.length} students`);
 * }
 * ```
 */
export async function getTeacherDetails(teacherId: string): Promise<TeacherDetails | null> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_teacher_details' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  // SPE-336: the caller's own caseload rows for this teacher, resolved through
  // the link set rather than the single legacy column.
  const linkedStudentIds = await getLinkedStudentIds(supabase, teacherId);

  const fetchPerf = measurePerformanceWithAlerts('fetch_teacher_details', 'database');

  const [teacherResult, studentsResult] = await Promise.all([
    safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .eq('id', teacherId)
          .single();
        if (error) throw error;
        return data;
      },
      { 
        operation: 'fetch_teacher', 
        userId: user.id,
        teacherId
      }
    ),
    safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('students')
          .select('id, initials, grade_level, sessions_per_week, minutes_per_session')
          .in('id', linkedStudentIds)
          .eq('provider_id', user.id)
          .order('grade_level', { ascending: true })
          .order('initials', { ascending: true });
        if (error) throw error;
        return data;
      },
      { 
        operation: 'fetch_teacher_students', 
        userId: user.id,
        teacherId
      }
    )
  ]);
  
  fetchPerf.end({ success: !teacherResult.error && !studentsResult.error });

  if (teacherResult.error) {
    const error = teacherResult.error as PostgrestError;
    if (error.code === 'PGRST116' ||
        error.message?.includes('No rows returned')) {
      return null;
    }
    throw teacherResult.error;
  }

  if (!teacherResult.data) return null;

  // Transform student data to provide defaults for nullable numeric fields
  const assignedStudents = (studentsResult.data || []).map(student => ({
    id: student.id,
    initials: student.initials,
    grade_level: student.grade_level,
    sessions_per_week: student.sessions_per_week ?? 0,
    minutes_per_session: student.minutes_per_session ?? 0
  }));

  return {
    ...teacherResult.data,
    assigned_students: assignedStudents
  };
}

export async function upsertTeacherDetails(
  teacherId: string | null,
  details: Omit<Teacher, 'id' | 'created_at' | 'updated_at'>
): Promise<Teacher> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_upsert_teacher' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('You must be logged in');
  }

  const user = authResult.data.data.user;

  const upsertPerf = measurePerformanceWithAlerts('upsert_teacher_details', 'database');
  
  if (teacherId) {
    const updateResult = await safeQuery(
      async () => {
        const { data, error} = await supabase
          .from('teachers')
          .update({
            ...details,
            updated_at: new Date().toISOString()
          })
          .eq('id', teacherId)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      { 
        operation: 'update_teacher_details', 
        userId: user.id,
        teacherId
      }
    );
    upsertPerf.end({ success: !updateResult.error });

    if (updateResult.error) {
      throw updateResult.error;
    }
    return updateResult.data!;
  } else {
    const insertResult = await safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('teachers')
          .insert([{
            ...details
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      { 
        operation: 'insert_teacher_details', 
        userId: user.id
      }
    );
    upsertPerf.end({ success: !insertResult.error });

    if (insertResult.error) {
      throw insertResult.error;
    }
    return insertResult.data!;
  }
}

export async function getStudentsByTeacher(teacherId: string): Promise<Student[]> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_students_by_teacher' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  // SPE-336: through the link set (see getTeacherDetails above).
  const linkedStudentIds = await getLinkedStudentIds(supabase, teacherId);
  if (linkedStudentIds.length === 0) return [];

  const fetchPerf = measurePerformanceWithAlerts('fetch_students_by_teacher', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .in('id', linkedStudentIds)
        .eq('provider_id', user.id)
        .order('grade_level', { ascending: true })
        .order('initials', { ascending: true });
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_students_by_teacher', 
      userId: user.id,
      teacherId
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }
  
  return fetchResult.data || [];
}

/*
 * SPE-337 removed `getTeacherByStudentTeacherName`.
 *
 * It resolved a teacher by fuzzy-matching the free-text `students.teacher_name`
 * — how the teacher modal used to open. That contract is gone: the modal is
 * keyed by `teachers.id`, so a typo can no longer open the wrong record, and
 * its `.limit(1)` over "duplicate teacher records" can no longer silently pick
 * one of several. A student with a SET of teachers has no single name to match
 * on in any case.
 */
