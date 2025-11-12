import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';
import type { Json } from '../../../src/types/database';

export interface StudentDetails {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  district_id: string;
  upcoming_iep_date: string;
  upcoming_triennial_date: string;
  iep_goals: string[];
  working_skills: string[];
}

/**
 * Safely converts a Json value to a string array
 * Filters out any non-string values
 */
function jsonToStringArray(value: Json | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export async function getStudentDetails(studentId: string): Promise<StudentDetails | null> {
  const supabase = createClient<Database>();

  const fetchPerf = measurePerformanceWithAlerts('fetch_student_details', 'database');
  const fetchResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_details')
        .select('*')
        .eq('student_id', studentId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_student_details', 
      studentId 
    }
  );
  fetchPerf.end({ success: !fetchResult.error });

  if (fetchResult.error) {
    console.error('Error fetching student details:', fetchResult.error);
    throw fetchResult.error;
  }

  const data = fetchResult.data;
  if (!data) return null;

  return {
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    date_of_birth: data.date_of_birth || '',
    district_id: data.district_id || '',
    upcoming_iep_date: data.upcoming_iep_date || '',
    upcoming_triennial_date: data.upcoming_triennial_date || '',
    iep_goals: data.iep_goals || [],
    working_skills: jsonToStringArray(data.working_skills)
  };
}

export async function upsertStudentDetails(
  studentId: string, 
  details: StudentDetails
): Promise<void> {
  const supabase = createClient<Database>();

  const upsertPerf = measurePerformanceWithAlerts('upsert_student_details', 'database');
  const upsertResult = await safeQuery(
    async () => {
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
          working_skills: details.working_skills,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'student_id'  // Add this to specify the conflict column
        });
      if (error) throw error;
      return null;
    },
    { 
      operation: 'upsert_student_details', 
      studentId,
      hasFirstName: !!details.first_name,
      hasLastName: !!details.last_name,
      hasDateOfBirth: !!details.date_of_birth,
      hasIepDate: !!details.upcoming_iep_date,
      hasTriennialDate: !!details.upcoming_triennial_date,
      iepGoalsCount: details.iep_goals.length,
      workingSkillsCount: details.working_skills.length
    }
  );
  upsertPerf.end({ success: !upsertResult.error });

  if (upsertResult.error) {
    console.error('Error saving student details:', upsertResult.error);
    console.error('Error details:', upsertResult.error.message, (upsertResult.error as any).details, (upsertResult.error as any).hint);
    throw upsertResult.error;
  }
}