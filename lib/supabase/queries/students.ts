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

  // Add detailed logging
  console.log('createStudent called with:', studentData);
  console.log('Auth check result:', { user, userError });
  
  if (userError || !user) {
    throw new Error('You must be logged in to add students');
  }

  console.log('Current user ID:', user.id);
  console.log('Current user email:', user.email);

  // Check if profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  console.log('Profile check:', { profile, profileError });

  if (!profile) {
    throw new Error('No profile found. Please contact support.');
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
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteStudent(studentId: string) {
  const supabase = createClientComponentClient();
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId);

  if (error) throw error;
}

export async function updateStudent(studentId: string, studentData: {
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
}) {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase
    .from('students')
    .update(studentData)
    .eq('id', studentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
