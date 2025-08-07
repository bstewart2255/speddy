import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';

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

  const fetchPerf = measurePerformanceWithAlerts('fetch_teacher_details', 'database');
  
  const [teacherResult, studentsResult] = await Promise.all([
    safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .eq('id', teacherId)
          .eq('provider_id', user.id)
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
          .eq('teacher_id', teacherId)
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
    if ((teacherResult.error as any).code === 'PGRST116' || 
        teacherResult.error.message?.includes('No rows returned')) {
      return null;
    }
    throw teacherResult.error;
  }

  if (!teacherResult.data) return null;

  return {
    ...teacherResult.data,
    assigned_students: studentsResult.data || []
  };
}

export async function upsertTeacherDetails(
  teacherId: string | null, 
  details: Omit<Teacher, 'id' | 'provider_id' | 'created_at' | 'updated_at'>
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
        const { data, error } = await supabase
          .from('teachers')
          .update({
            ...details,
            updated_at: new Date().toISOString()
          })
          .eq('id', teacherId)
          .eq('provider_id', user.id)
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
            ...details,
            provider_id: user.id
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

  const fetchPerf = measurePerformanceWithAlerts('fetch_students_by_teacher', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('teacher_id', teacherId)
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

export async function getTeacherByStudentTeacherName(teacherName: string): Promise<Teacher | null> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_teacher_by_name' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  const nameParts = teacherName.trim().split(' ');
  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(' ');

  const fetchPerf = measurePerformanceWithAlerts('fetch_teacher_by_student_name', 'database');
  const fetchResult = await safeQuery(
    async () => {
      let query = supabase
        .from('teachers')
        .select('*')
        .eq('provider_id', user.id);

      if (firstName && lastName) {
        query = query
          .ilike('first_name', firstName)
          .ilike('last_name', lastName);
      } else {
        query = query.or(`last_name.ilike.%${teacherName}%,first_name.ilike.%${teacherName}%`);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_teacher_by_student_name', 
      userId: user.id,
      teacherName
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching teacher by name:', fetchResult.error);
    return null;
  }
  
  return fetchResult.data;
}