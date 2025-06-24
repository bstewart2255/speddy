import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Create a student record for the logged in provider.
 */
export async function createStudent(studentData: {
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
}) {
  const supabase = createClientComponentClient();

  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('You must be logged in to add students');
  }

  // Try to insert the student
  const { data, error } = await supabase
    .from('students')
    .insert([{
      initials: studentData.initials,
      grade_level: studentData.grade_level.trim(),
      teacher_name: studentData.teacher_name,
      sessions_per_week: studentData.sessions_per_week,
      minutes_per_session: studentData.minutes_per_session,
      provider_id: user.id
    }])
    .select()
    .single();

  if (error) {
    console.error('Detailed Supabase error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    throw new Error(error.message || 'Failed to add student');
  }

  return data;
}

/**
 * Fetch all students owned by the current provider.
 */
export async function getStudents() {
  const supabase = createClientComponentClient();

  // Get current user to filter by provider_id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user found');

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('provider_id', user.id)  // Only get current provider's students
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Delete a student and their sessions if the user owns them.
 */
export async function deleteStudent(studentId: string) {
  const supabase = createClientComponentClient();

  // CRITICAL: Get current user to verify ownership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user found');

  // CRITICAL: First verify the user owns this student
  const { data: student, error: checkError } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('provider_id', user.id)
    .single();

  if (checkError || !student) {
    throw new Error('Student not found or access denied');
  }

  // Delete schedule_sessions for this student (with provider_id check)
  await supabase
    .from('schedule_sessions')
    .delete()
    .eq('student_id', studentId)
    .eq('provider_id', user.id); // CRITICAL: Only delete sessions owned by this provider

  // Then delete the student (with provider_id check)
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId)
    .eq('provider_id', user.id); // CRITICAL: Only delete if user owns this student

  if (error) throw error;
}

/**
 * Update a student's session requirements if owned by the user.
 */
export async function updateStudent(studentId: string, updates: {
  sessions_per_week: number;
  minutes_per_session: number;
}) {
  const supabase = createClientComponentClient();

  // CRITICAL: Get current user to verify ownership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user found');

  // Only allow updating sessions_per_week and minutes_per_session
  const { data, error } = await supabase
    .from('students')
    .update({
      sessions_per_week: updates.sessions_per_week,
      minutes_per_session: updates.minutes_per_session
    })
    .eq('id', studentId)
    .eq('provider_id', user.id) // CRITICAL: Only update if user owns this student
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Student not found or access denied');
    }
    throw error;
  }

  return data;
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
  const supabase = createClientComponentClient();

  // First create the student as before
  const student = await createStudent(studentData);

  // Return the student - scheduling will be handled by the component
  return student;
}