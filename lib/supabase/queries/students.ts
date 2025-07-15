import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

/**
 * Create a student record for the logged in provider.
 */
export async function createStudent(studentData: {
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
  school_site?: string;
  school_district?: string;
}) {
  const supabase = createClient();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_create_student' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('You must be logged in to add students');
  }

  const user = authResult.data.data.user;

  // If school_site and school_district are not provided, get them from user profile
  let finalSchoolSite = studentData.school_site;
  let finalSchoolDistrict = studentData.school_district;

  if (!finalSchoolSite || !finalSchoolDistrict) {
    const profilePerf = measurePerformanceWithAlerts('fetch_profile_for_student', 'database');
    const profileResult = await safeQuery(
      () => supabase
        .from('profiles')
        .select('school_site, school_district')
        .eq('id', user.id)
        .single(),
      { operation: 'fetch_profile_for_student', userId: user.id }
    );
    profilePerf.end({ success: !profileResult.error });

    if (profileResult.data) {
      finalSchoolSite = finalSchoolSite || profileResult.data.school_site;
      finalSchoolDistrict = finalSchoolDistrict || profileResult.data.school_district;
    }
  }

  const insertPerf = measurePerformanceWithAlerts('create_student', 'database');
  const insertResult = await safeQuery(
    () => supabase
      .from('students')
      .insert([{
        initials: studentData.initials,
        grade_level: studentData.grade_level.trim(),
        teacher_name: studentData.teacher_name,
        sessions_per_week: studentData.sessions_per_week,
        minutes_per_session: studentData.minutes_per_session,
        provider_id: user.id,
        school_site: finalSchoolSite,
        school_district: finalSchoolDistrict
      }])
      .select()
      .single(),
    { 
      operation: 'create_student', 
      userId: user.id,
      studentInitials: studentData.initials 
    }
  );
  insertPerf.end({ success: !insertResult.error });

  if (insertResult.error) {
    throw new Error(insertResult.error.message || 'Failed to add student');
  }

  return insertResult.data;
}

/**
 * Fetch all students owned by the current provider.
 */
export async function getStudents(schoolSite?: string) {
  const supabase = createClient();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_students' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_students', 'database');
  const fetchResult = await safeQuery(
    () => {
      let query = supabase
        .from('students')
        .select('*')
        .eq('provider_id', user.id);

      // Add school filter if provided
      if (schoolSite) {
        query = query.eq('school_site', schoolSite);
      }

      return query.order('created_at', { ascending: false });
    },
    { 
      operation: 'fetch_students', 
      userId: user.id,
      schoolSite 
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) throw fetchResult.error;
  return fetchResult.data || [];
}

/**
 * Delete a student and their sessions if the user owns them.
 */
export async function deleteStudent(studentId: string) {
  const supabase = createClient();
  
  // CRITICAL: Get current user to verify ownership
  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_student' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  // CRITICAL: First verify the user owns this student
  const verifyPerf = measurePerformanceWithAlerts('verify_student_ownership', 'database');
  const verifyResult = await safeQuery(
    () => supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .eq('provider_id', user.id)
      .single(),
    { 
      operation: 'verify_student_ownership', 
      userId: user.id,
      studentId 
    }
  );
  verifyPerf.end({ success: !verifyResult.error });

  if (verifyResult.error || !verifyResult.data) {
    throw new Error('Student not found or access denied');
  }

  // Delete schedule_sessions for this student (with provider_id check)
  const deleteSessionsPerf = measurePerformanceWithAlerts('delete_student_sessions', 'database');
  await safeQuery(
    () => supabase
      .from('schedule_sessions')
      .delete()
      .eq('student_id', studentId)
      .eq('provider_id', user.id), // CRITICAL: Only delete sessions owned by this provider
    { 
      operation: 'delete_student_sessions', 
      userId: user.id,
      studentId 
    }
  );
  deleteSessionsPerf.end();

  // Then delete the student (with provider_id check)
  const deleteStudentPerf = measurePerformanceWithAlerts('delete_student', 'database');
  const deleteResult = await safeQuery(
    () => supabase
      .from('students')
      .delete()
      .eq('id', studentId)
      .eq('provider_id', user.id), // CRITICAL: Only delete if user owns this student
    { 
      operation: 'delete_student', 
      userId: user.id,
      studentId 
    }
  );
  deleteStudentPerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}

/**
 * Update a student's session requirements if owned by the user.
 */
export async function updateStudent(studentId: string, updates: {
  grade_level?: string;
  teacher_name?: string;
  sessions_per_week?: number;
  minutes_per_session?: number;
}) {
  const supabase = createClient();

  // CRITICAL: Get current user to verify ownership
  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_update_student' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  // Build update object with only provided fields
  const updateData: any = {};
  if (updates.grade_level !== undefined) updateData.grade_level = updates.grade_level;
  if (updates.teacher_name !== undefined) updateData.teacher_name = updates.teacher_name;
  if (updates.sessions_per_week !== undefined) updateData.sessions_per_week = updates.sessions_per_week;
  if (updates.minutes_per_session !== undefined) updateData.minutes_per_session = updates.minutes_per_session;

  const updatePerf = measurePerformanceWithAlerts('update_student', 'database');
  const updateResult = await safeQuery(
    () => supabase
      .from('students')
      .update(updateData)
      .eq('id', studentId)
      .eq('provider_id', user.id) // CRITICAL: Only update if user owns this student
      .select()
      .single(),
    { 
      operation: 'update_student', 
      userId: user.id,
      studentId,
      updates: Object.keys(updateData)
    }
  );
  updatePerf.end({ success: !updateResult.error });

  if (updateResult.error) {
    if (updateResult.error.message?.includes('PGRST116')) {
      throw new Error('Student not found or access denied');
    }
    throw updateResult.error;
  }

  return updateResult.data;
}

/**
* Convenience wrapper that creates a student and returns the new record.
*/
export async function createStudentWithAutoSchedule(studentData: {
initials: string;
grade_level: string;
teacher_name: string;
sessions_per_week: number;
minutes_per_session: number;
}) {
const supabase = createClient();

// First create the student as before
const student = await createStudent(studentData);

// Return the student - scheduling will be handled by the component
return student;
}