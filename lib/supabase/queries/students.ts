import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { buildSchoolFilter, type SchoolIdentifier } from '@/lib/school-helpers';
import { updateExistingSessionsForStudent } from '../../scheduling/session-requirement-sync';
import { requireNonNull } from '@/lib/types/utils';
import type { Database } from '../../../src/types/database';

/**
 * Create a student record for the logged in provider.
 * Supports both structured and text-based school identification.
 *
 * @param studentData.teacher_id - Recommended: ID of the teacher from the teachers table
 * @param studentData.teacher_name - Deprecated: Use teacher_id instead. Kept for backward compatibility.
 */
export async function createStudent(studentData: {
  initials: string;
  grade_level: string;
  teacher_name?: string; // Deprecated: Use teacher_id instead
  teacher_id?: string | null;
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

  // Fetch user profile to get role and school data
  const profilePerf = measurePerformanceWithAlerts('fetch_profile_for_student', 'database');
  const profileResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, school_site, school_district, school_id, district_id, state_id')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    { operation: 'fetch_profile_for_student', userId: user.id }
  );
  profilePerf.end({ success: !profileResult.error });

  // Get service_type from provider's role (default to 'resource' if not found)
  const serviceType = profileResult.data?.role || 'resource';

  // Get complete school data - use provided data or fall back to profile
  const schoolData: SchoolIdentifier = {
    school_site: studentData.school_site || profileResult.data?.school_site,
    school_district: studentData.school_district || profileResult.data?.school_district,
    school_id: studentData.school_id || profileResult.data?.school_id,
    district_id: studentData.district_id || profileResult.data?.district_id,
    state_id: studentData.state_id || profileResult.data?.state_id
  };

  // Use the provided teacher_id
  // Note: teacher_name is deprecated and only kept for backward compatibility
  const teacherId = studentData.teacher_id;

  const insertPerf = measurePerformanceWithAlerts('create_student', 'database');
  const insertResult = await safeQuery(
    async () => {
      // Build insert data
      const insertData: any = {
        initials: studentData.initials,
        grade_level: studentData.grade_level.trim(),
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

      // Deprecated: Include teacher_name for backward compatibility if provided
      if (studentData.teacher_name) {
        insertData.teacher_name = studentData.teacher_name;
      }
      
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
    if (insertResult.error.message?.includes('duplicate key')) {
      throw new Error(
        `A student with the initials "${studentData.initials}" in grade ${studentData.grade_level} already exists. Please use different initials or update the existing student.`
      );
    }
    throw new Error(insertResult.error.message || 'Failed to add student');
  }

  const createdStudent = requireNonNull(insertResult.data, 'created student data');

  // Create unscheduled sessions if schedule requirements are present
  if (studentData.sessions_per_week && studentData.minutes_per_session) {
    try {
      const sessionsPerf = measurePerformanceWithAlerts('create_unscheduled_sessions', 'database');

      // Create N unscheduled session records
      const unscheduledSessions = Array.from({ length: studentData.sessions_per_week }, () => ({
        student_id: createdStudent.id,
        provider_id: user.id,
        day_of_week: null,
        start_time: null,
        end_time: null,
        service_type: serviceType,
        status: 'active' as const,
        delivered_by: 'provider' as const,
      }));

      const sessionsResult = await safeQuery(
        async () => {
          const { error } = await supabase
            .from('schedule_sessions')
            .insert(unscheduledSessions);
          if (error) throw error;
          return null;
        },
        {
          operation: 'create_unscheduled_sessions',
          userId: user.id,
          studentId: createdStudent.id,
          sessionCount: studentData.sessions_per_week,
        }
      );
      sessionsPerf.end({ success: !sessionsResult.error });

      if (sessionsResult.error) {
        // If session creation fails, rollback the student
        console.error('Failed to create sessions, rolling back student:', sessionsResult.error);
        await safeQuery(
          async () => {
            const { error } = await supabase
              .from('students')
              .delete()
              .eq('id', createdStudent.id);
            if (error) throw error;
            return null;
          },
          { operation: 'rollback_student_after_session_failure' }
        );
        throw new Error('Failed to create sessions for student. Student creation has been rolled back.');
      }
    } catch (error) {
      // Re-throw session creation errors
      throw error;
    }
  }

  return createdStudent;
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
 *
 * @param updates.teacher_id - ID of the teacher from the teachers table
 * @param updates.teacher_name - Deprecated: Use teacher_id instead. Kept for backward compatibility.
 */
export async function updateStudent(studentId: string, updates: {
  initials?: string;
  grade_level?: string;
  teacher_name?: string; // Deprecated: Use teacher_id instead
  teacher_id?: string | null;
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

  // Build update object with only provided fields
  const updateData: any = {};
  if (updates.initials !== undefined) updateData.initials = updates.initials;
  if (updates.grade_level !== undefined) updateData.grade_level = updates.grade_level;
  if (updates.teacher_id !== undefined) updateData.teacher_id = updates.teacher_id;
  if (updates.sessions_per_week !== undefined) updateData.sessions_per_week = updates.sessions_per_week;
  if (updates.minutes_per_session !== undefined) updateData.minutes_per_session = updates.minutes_per_session;

  // Deprecated: Include teacher_name for backward compatibility if provided
  if (updates.teacher_name !== undefined) {
    updateData.teacher_name = updates.teacher_name;
  }

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

  const updatedStudent = requireNonNull(updateResult.data, 'updated student data');

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
        minutes_per_session: updatedStudent.minutes_per_session,
        sessions_per_week: updatedStudent.sessions_per_week,
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
*
* @param studentData.teacher_id - Recommended: ID of the teacher from the teachers table
* @param studentData.teacher_name - Deprecated: Use teacher_id instead.
*/
export async function createStudentWithAutoSchedule(studentData: {
initials: string;
grade_level: string;
teacher_name?: string; // Deprecated: Use teacher_id instead
teacher_id?: string | null;
sessions_per_week: number;
minutes_per_session: number;
} & Partial<SchoolIdentifier>) {
const supabase = createClient();

// First create the student as before
const student = await createStudent(studentData);

// Return the student - scheduling will be handled by the component
return student;
}