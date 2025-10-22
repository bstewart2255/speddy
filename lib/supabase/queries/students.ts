import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { buildSchoolFilter, type SchoolIdentifier } from '@/lib/school-helpers';
import { getOrCreateTeacher } from './teachers';
import { updateExistingSessionsForStudent } from '../../scheduling/session-requirement-sync';
import type { Database } from '../../../src/types/database';

/**
 * Create a student record for the logged in provider.
 * Supports both structured and text-based school identification.
 */
export async function createStudent(studentData: {
  initials: string;
  grade_level: string;
  teacher_name: string;
  teacher_id?: string;
  sessions_per_week: number;
  minutes_per_session: number;
} & Partial<SchoolIdentifier>) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_create_student' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('You must be logged in to add students');
  }

  const user = authResult.data.data.user;

  // Get complete school data if not provided
  let schoolData: SchoolIdentifier = {
    school_site: studentData.school_site,
    school_district: studentData.school_district,
    school_id: studentData.school_id,
    district_id: studentData.district_id,
    state_id: studentData.state_id
  };

  // If no school data provided, fetch from user profile
  if (!schoolData.school_site && !schoolData.school_id) {
    const profilePerf = measurePerformanceWithAlerts('fetch_profile_for_student', 'database');
    const profileResult = await safeQuery(
      async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('school_site, school_district, school_id, district_id, state_id')
          .eq('id', user.id)
          .single();
        if (error) throw error;
        return data;
      },
      { operation: 'fetch_profile_for_student', userId: user.id }
    );
    profilePerf.end({ success: !profileResult.error });

    if (profileResult.data) {
      schoolData = {
        school_site: schoolData.school_site || profileResult.data.school_site,
        school_district: schoolData.school_district || profileResult.data.school_district,
        school_id: schoolData.school_id || profileResult.data.school_id,
        district_id: schoolData.district_id || profileResult.data.district_id,
        state_id: schoolData.state_id || profileResult.data.state_id
      };
    }
  }

  // Get or create teacher if teacher_name is provided but no teacher_id
  // Now we have the complete school data to associate with the teacher
  let teacherId = studentData.teacher_id;
  if (!teacherId && studentData.teacher_name) {
    try {
      const teacher = await getOrCreateTeacher(studentData.teacher_name, {
        school_id: schoolData.school_id ?? null,
        school_site: schoolData.school_site ?? null
      });
      teacherId = teacher.id;
    } catch (error) {
      console.error('Error creating teacher:', error);
      // Continue without teacher_id if creation fails
    }
  }

  const insertPerf = measurePerformanceWithAlerts('create_student', 'database');
  const insertResult = await safeQuery(
    async () => {
      // Build insert data with both ID and text fields for compatibility
      const insertData: any = {
        initials: studentData.initials,
        grade_level: studentData.grade_level.trim(),
        teacher_name: studentData.teacher_name,
        teacher_id: teacherId || null,
        sessions_per_week: studentData.sessions_per_week,
        minutes_per_session: studentData.minutes_per_session,
        provider_id: user.id,
        school_site: schoolData.school_site,
        school_district: schoolData.school_district,
        // Add structured IDs - the following columns assume the relevant database migration has been completed
        // Migration adds: school_id, district_id, state_id columns to the students table
        school_id: schoolData.school_id,
        district_id: schoolData.district_id,
        state_id: schoolData.state_id
      };
      
      const { data, error } = await supabase
        .from('students')
        .insert([insertData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    { 
      operation: 'create_student', 
      userId: user.id,
      studentInitials: studentData.initials,
      schoolId: schoolData.school_id,
      isMigrated: !!schoolData.school_id
    }
  );
  insertPerf.end({ success: !insertResult.error });

  if (insertResult.error) {
    // Check for duplicate student error
    if (insertResult.error.message?.includes('duplicate key') &&
        insertResult.error.message?.includes('students_provider_id_initials_grade_level_teacher_name_key')) {
      throw new Error(
        `A student with the initials "${studentData.initials}" and teacher "${studentData.teacher_name}" in grade ${studentData.grade_level} already exists. Please use different initials or update the existing student.`
      );
    }
    throw new Error(insertResult.error.message || 'Failed to add student');
  }

  return insertResult.data;
}

/**
 * Fetch all students owned by the current provider.
 * Uses intelligent filtering based on available school identifiers.
 */
export async function getStudents(school?: SchoolIdentifier) {
  const queryType = school?.school_id ? 'indexed' : 'text-based';
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_fetch_students' }
  );
  
  if (authResult.error || !authResult.data?.data.user) {
    console.error('[getStudents] No user found');
    throw new Error('No user found');
  }
  
  const user = authResult.data.data.user;

  const fetchPerf = measurePerformanceWithAlerts('fetch_students', 'database');
  const fetchResult = await safeQuery(
    async () => {
      let query = supabase
        .from('students')
        .select('*')
        .eq('provider_id', user.id);

      // Apply intelligent school filter for optimal performance
      if (school) {
        if (school.school_id) {
          // Include both records matching school_id AND legacy records with NULL school_id
          // This ensures legacy students show up alongside new structured records
          query = query.or(`school_id.eq.${school.school_id},school_id.is.null`);
        } else {
          // Fall back to text-based filtering for legacy data
          if (school.school_site) {
            query = query.eq('school_site', school.school_site);
          }
          if (school.school_district) {
            query = query.eq('school_district', school.school_district);
          }
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_students', 
      userId: user.id,
      schoolSite: school?.school_site,
      schoolId: school?.school_id,
      queryType,
      isMigrated: !!school?.school_id
    }
  );
  fetchPerf.end({ 
    success: !fetchResult.error,
    metadata: { queryType, recordCount: fetchResult.data?.length || 0 }
  });

  if (fetchResult.error) {
    console.error('[getStudents] Query error:', fetchResult.error);
    throw fetchResult.error;
  }
  
  return fetchResult.data || [];
}

/**
 * Delete a student and their sessions if the user owns them.
 */
export async function deleteStudent(studentId: string) {
  const supabase = createClient<Database>();
  
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
    async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id')
        .eq('id', studentId)
        .eq('provider_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
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
    async () => {
      const { error } = await supabase
        .from('schedule_sessions')
        .delete()
        .eq('student_id', studentId)
        .eq('provider_id', user.id); // CRITICAL: Only delete sessions owned by this provider
      if (error) throw error;
      return null;
    },
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
    async () => {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId)
        .eq('provider_id', user.id); // CRITICAL: Only delete if user owns this student
      if (error) throw error;
      return null;
    },
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
 * Returns the updated student and optionally sync result information
 */
export async function updateStudent(studentId: string, updates: {
  initials?: string;
  grade_level?: string;
  teacher_name?: string;
  teacher_id?: string;
  sessions_per_week?: number;
  minutes_per_session?: number;
}): Promise<{
  student: any;
  syncResult?: { success: boolean; error?: string; conflictCount?: number };
}> {
  const supabase = createClient<Database>();

  // CRITICAL: Get current user to verify ownership
  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_update_student' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('No user found');
  }

  const user = authResult.data.data.user;

  // Fetch old student data before updating (needed for session sync)
  const oldStudentResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('students')
        .select('sessions_per_week, minutes_per_session')
        .eq('id', studentId)
        .eq('provider_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_student_before_update' }
  );

  // Get or create teacher if teacher_name is provided but no teacher_id
  let teacherId = updates.teacher_id;
  if (!teacherId && updates.teacher_name) {
    try {
      const teacher = await getOrCreateTeacher(updates.teacher_name);
      teacherId = teacher.id;
    } catch (error) {
      console.error('Error creating teacher:', error);
      // Continue without teacher_id if creation fails
    }
  }

  // Build update object with only provided fields
  const updateData: any = {};
  if (updates.initials !== undefined) updateData.initials = updates.initials;
  if (updates.grade_level !== undefined) updateData.grade_level = updates.grade_level;
  if (updates.teacher_name !== undefined) updateData.teacher_name = updates.teacher_name;
  if (teacherId !== undefined) updateData.teacher_id = teacherId;
  if (updates.sessions_per_week !== undefined) updateData.sessions_per_week = updates.sessions_per_week;
  if (updates.minutes_per_session !== undefined) updateData.minutes_per_session = updates.minutes_per_session;

  const updatePerf = measurePerformanceWithAlerts('update_student', 'database');
  const updateResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('students')
        .update(updateData)
        .eq('id', studentId)
        .eq('provider_id', user.id) // CRITICAL: Only update if user owns this student
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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

  // If scheduling requirements changed, sync existing sessions
  const requirementsChanged =
    updates.sessions_per_week !== undefined ||
    updates.minutes_per_session !== undefined;

  let syncResult: { success: boolean; error?: string; conflictCount?: number } | undefined;

  if (requirementsChanged && oldStudentResult.data) {
    syncResult = await updateExistingSessionsForStudent(
      studentId,
      {
        minutes_per_session: oldStudentResult.data.minutes_per_session,
        sessions_per_week: oldStudentResult.data.sessions_per_week,
      },
      {
        minutes_per_session: updateResult.data.minutes_per_session,
        sessions_per_week: updateResult.data.sessions_per_week,
      }
    );

    if (!syncResult.success) {
      console.error('Failed to sync sessions:', syncResult.error);
      // Don't throw - student update was successful, return sync error to caller
    } else if (syncResult.conflictCount && syncResult.conflictCount > 0) {
      console.log(`Updated sessions with ${syncResult.conflictCount} conflicts flagged`);
    }
  }

  return {
    student: updateResult.data,
    syncResult,
  };
}

/**
* Convenience wrapper that creates a student and returns the new record.
* Supports both structured and text-based school identification.
*/
export async function createStudentWithAutoSchedule(studentData: {
initials: string;
grade_level: string;
teacher_name: string;
sessions_per_week: number;
minutes_per_session: number;
} & Partial<SchoolIdentifier>) {
const supabase = createClient();

// First create the student as before
const student = await createStudent(studentData);

// Return the student - scheduling will be handled by the component
return student;
}