import { createClient } from '@/lib/supabase/client';
import { getCurrentSchoolYear } from '@/lib/school-year';
import type { InstructionSchedule } from '@/src/types/database';

/**
 * Fetch all instruction schedules for a school/year.
 */
export async function getInstructionSchedules(
  schoolId: string,
  schoolYear?: string
): Promise<InstructionSchedule[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  let query = supabase
    .from('instruction_schedules')
    .select('*')
    .eq('school_id', schoolId);

  if (schoolYear) {
    query = query.eq('school_year', schoolYear);
  }

  const { data, error } = await query
    .order('start_time')
    .order('day_of_week');

  if (error) {
    console.error('Error fetching instruction schedules:', error);
    throw error;
  }

  return data || [];
}

/**
 * Add a new instruction schedule as a site admin.
 */
export async function addInstructionSchedule(schedule: {
  school_id: string;
  teacher_id: string;
  teacher_name: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  school_year?: string;
}): Promise<InstructionSchedule> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('instruction_schedules')
    .insert({
      ...schedule,
      school_year: schedule.school_year || getCurrentSchoolYear(),
      created_by_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding instruction schedule:', error);
    throw error;
  }

  return data;
}

/**
 * Update an instruction schedule by id.
 */
export async function updateInstructionSchedule(
  id: string,
  schoolId: string,
  updates: {
    subject?: string;
    start_time?: string;
    end_time?: string;
  }
): Promise<InstructionSchedule> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('instruction_schedules')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();

  if (error) {
    console.error('Error updating instruction schedule:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Failed to update instruction schedule');
  }

  return data;
}

/**
 * Delete an instruction schedule by id.
 */
export async function deleteInstructionSchedule(
  id: string,
  schoolId: string
): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('instruction_schedules')
    .delete()
    .eq('id', id)
    .eq('school_id', schoolId);

  if (error) {
    console.error('Error deleting instruction schedule:', error);
    throw error;
  }
}
