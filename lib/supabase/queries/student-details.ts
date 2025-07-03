import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../src/types/database';

export interface StudentDetails {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  district_id: string;
  upcoming_iep_date: string;
  upcoming_triennial_date: string;
  iep_goals: string[];
}

export async function getStudentDetails(studentId: string): Promise<StudentDetails | null> {
  const supabase = createClientComponentClient<Database>();

  const { data, error } = await supabase
    .from('student_details')
    .select('*')
    .eq('student_id', studentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // No rows returned
      return null;
    }
    console.error('Error fetching student details:', error);
    throw error;
  }

  return {
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    date_of_birth: data.date_of_birth || '',
    district_id: data.district_id || '',
    upcoming_iep_date: data.upcoming_iep_date || '',
    upcoming_triennial_date: data.upcoming_triennial_date || '',
    iep_goals: data.iep_goals || [],
  };
}

export async function upsertStudentDetails(
  studentId: string, 
  details: StudentDetails
): Promise<void> {
  const supabase = createClientComponentClient<Database>();

  const { error } = await supabase
    .from('student_details')
    .upsert({
      student_id: studentId,
      first_name: details.first_name,
      last_name: details.last_name,
      date_of_birth: details.date_of_birth || null,
      district_id: details.district_id,
      upcoming_iep_date: details.upcoming_iep_date || null,
      upcoming_triennial_date: details.upcoming_triennial_date || null,
      iep_goals: details.iep_goals,
      updated_at: new Date().toISOString(),
    })
    .eq('student_id', studentId);

  if (error) {
    console.error('Error saving student details:', error);
    throw error;
  }
}