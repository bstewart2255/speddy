import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { requireNonNull } from '@/lib/types/utils';
import type { Database } from '../../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];
type StudentDetails = Database['public']['Tables']['student_details']['Row'];
type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];

/**
 * Get the teacher record for the current user
 */
export async function getCurrentTeacher() {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_current_teacher' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_current_teacher', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('account_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_current_teacher',
      userId: user.id
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw new Error('Teacher record not found');
  }

  return requireNonNull(fetchResult.data, 'teacher record');
}

/**
 * Get students assigned to the current teacher that are in resource
 */
export async function getMyStudentsInResource() {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_my_students' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  // First get teacher ID
  const teacher = await getCurrentTeacher();

  const fetchPerf = measurePerformanceWithAlerts('fetch_my_students_in_resource', 'database');
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
          student_details (
            iep_goals,
            upcoming_iep_date
          ),
          profiles!students_provider_id_fkey (
            full_name
          )
        `)
        .eq('teacher_id', teacher.id)
        .order('grade_level', { ascending: true })
        .order('initials', { ascending: true });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_my_students_in_resource',
      userId: user.id,
      teacherId: teacher.id
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}

/**
 * Get details for a specific student
 */
export async function getStudentDetails(studentId: string) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_student_details' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_details', 'database');
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
          student_details (
            iep_goals,
            upcoming_iep_date
          ),
          profiles!students_provider_id_fkey (
            full_name
          )
        `)
        .eq('id', studentId)
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_student_details',
      userId: user.id,
      studentId
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw new Error('Student not found or access denied');
  }

  return fetchResult.data;
}

/**
 * Get resource schedule for a specific student
 */
export async function getStudentResourceSchedule(studentId: string) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_student_schedule' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_schedule', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select('id, session_date, day_of_week, start_time, end_time, service_type')
        .eq('student_id', studentId)
        .eq('status', 'active')
        .not('session_date', 'is', null)
        .order('session_date', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_student_schedule',
      userId: user.id,
      studentId
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}

/**
 * Get special activities assigned to the current teacher
 */
export async function getMySpecialActivities() {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_my_activities' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  // Get teacher record to filter by teacher_id
  const teacher = await getCurrentTeacher();

  const fetchPerf = measurePerformanceWithAlerts('fetch_my_special_activities', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('special_activities')
        .select('*')
        .eq('teacher_id', teacher.id)
        .is('deleted_at', null)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_my_special_activities',
      userId: user.id,
      teacherId: teacher.id
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}

/**
 * Create a special activity as a teacher
 */
export async function createSpecialActivity(activityData: {
  teacher_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_name: string;
  school_id?: string | null;
}) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_create_activity' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  // Get teacher record to set teacher_id
  const teacher = await getCurrentTeacher();

  const insertPerf = measurePerformanceWithAlerts('create_special_activity', 'database');
  const insertResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('special_activities')
        .insert([{
          ...activityData,
          teacher_id: teacher.id,
          created_by_role: 'teacher',
          created_by_id: user.id,
          provider_id: null,  // School-wide, not owned by specific provider
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'create_special_activity',
      userId: user.id
    }
  );
  insertPerf.end({ success: !insertResult.error });

  if (insertResult.error) {
    throw new Error(insertResult.error.message || 'Failed to create special activity');
  }

  return insertResult.data;
}

/**
 * Update a special activity created by the current teacher
 */
export async function updateSpecialActivity(
  activityId: string,
  updates: {
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    activity_name?: string;
  }
) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_update_activity' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  const updatePerf = measurePerformanceWithAlerts('update_special_activity', 'database');
  const updateResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('special_activities')
        .update(updates)
        .eq('id', activityId)
        .eq('created_by_id', user.id)
        .eq('created_by_role', 'teacher')
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      operation: 'update_special_activity',
      userId: user.id,
      activityId
    }
  );
  updatePerf.end({ success: !updateResult.error });

  if (updateResult.error) {
    throw new Error('Activity not found or access denied');
  }

  return updateResult.data;
}

/**
 * Soft delete a special activity created by the current teacher
 * Sets deleted_at timestamp instead of permanently deleting the record
 */
export async function deleteSpecialActivity(activityId: string) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_activity' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  const deletePerf = measurePerformanceWithAlerts('delete_special_activity', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('special_activities')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', activityId)
        .eq('created_by_id', user.id)
        .eq('created_by_role', 'teacher')
        .is('deleted_at', null) // Only delete if not already deleted
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Activity not found, already deleted, or you do not have permission to delete it');
      }
      return null;
    },
    {
      operation: 'delete_special_activity',
      userId: user.id,
      activityId
    }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) {
    throw deleteResult.error;
  }
}

/**
 * Get today's resource sessions for the teacher's students
 */
export async function getTodayStudentSessions() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Return empty if weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return [];
  }

  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_today_sessions' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;
  const teacher = await getCurrentTeacher();

  // First, get the student IDs for this teacher
  const studentsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id')
        .eq('teacher_id', teacher.id);
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_teacher_student_ids',
      userId: user.id,
      teacherId: teacher.id
    }
  );

  if (studentsResult.error || !studentsResult.data || studentsResult.data.length === 0) {
    return [];
  }

  const studentIds = studentsResult.data.map(s => s.id);

  const fetchPerf = measurePerformanceWithAlerts('fetch_today_student_sessions', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select(`
          id,
          day_of_week,
          start_time,
          end_time,
          service_type,
          students (
            id,
            initials,
            grade_level
          )
        `)
        .in('student_id', studentIds)
        .eq('day_of_week', dayOfWeek)
        .is('session_date', null)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_today_student_sessions',
      userId: user.id,
      teacherId: teacher.id
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}

/**
 * Get today's special activities for the current teacher
 */
export async function getTodaySpecialActivities() {
  const today = new Date();
  const dayOfWeek = today.getDay();

  // Return empty if weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return [];
  }

  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_today_activities' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;
  const teacher = await getCurrentTeacher();

  const fetchPerf = measurePerformanceWithAlerts('fetch_today_special_activities', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('special_activities')
        .select('id, activity_name, start_time, end_time')
        .eq('teacher_id', teacher.id)
        .eq('day_of_week', dayOfWeek)
        .is('deleted_at', null)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_today_special_activities',
      userId: user.id,
      teacherId: teacher.id
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}

/**
 * Check if today is a holiday at the teacher's school
 */
export async function getTodayHolidays() {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_today_holidays' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;
  const teacher = await getCurrentTeacher();

  // If teacher has no school_id, return empty (no holidays to check)
  if (!teacher.school_id) {
    return [];
  }

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

  const fetchPerf = measurePerformanceWithAlerts('fetch_today_holidays', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, date, name')
        .eq('date', dateStr)
        .eq('school_id', teacher.school_id!);
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_today_holidays',
      userId: user.id,
      schoolId: teacher.school_id
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return fetchResult.data || [];
}
