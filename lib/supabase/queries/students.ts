import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
      grade_level: studentData.grade_level,
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

export async function deleteStudent(studentId: string) {
  const supabase = createClientComponentClient();

  // First delete any schedule_sessions for this student
  await supabase
    .from('schedule_sessions')
    .delete()
    .eq('student_id', studentId);

  // Then delete the student
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId);

  if (error) throw error;
}

export async function updateStudent(studentId: string, updates: {
  sessions_per_week: number;
  minutes_per_session: number;
}) {
  const supabase = createClientComponentClient();

  // Only allow updating sessions_per_week and minutes_per_session
  const { data, error } = await supabase
    .from('students')
    .update({
      sessions_per_week: updates.sessions_per_week,
      minutes_per_session: updates.minutes_per_session
    })
    .eq('id', studentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}