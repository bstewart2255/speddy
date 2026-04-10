import { createClient } from '@/lib/supabase/client';
import { getCurrentSchoolYear } from '@/lib/school-year';
import type { YardDutyAssignment } from '@/src/types/database';
import type { Database } from '@/src/types/database';

/**
 * Fetch all yard duty assignments for a school/year.
 */
export async function getYardDutyAssignments(
  schoolId: string,
  schoolYear?: string
): Promise<YardDutyAssignment[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  let query = supabase
    .from('yard_duty_assignments')
    .select('*')
    .eq('school_id', schoolId);

  if (schoolYear) {
    query = query.eq('school_year', schoolYear);
  }

  const { data, error } = await query
    .order('start_time')
    .order('day_of_week');

  if (error) {
    console.error('Error fetching yard duty assignments:', error);
    throw error;
  }

  return data || [];
}

/**
 * Add a new yard duty assignment as a site admin.
 */
export async function addYardDutyAssignment(assignment: {
  school_id: string;
  period_name: string;
  zone_name?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  teacher_id?: string | null;
  staff_id?: string | null;
  provider_id?: string | null;
  assignee_name: string;
  school_year?: string;
}): Promise<YardDutyAssignment> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Verify exactly one assignee
  if (!assignment.teacher_id && !assignment.staff_id && !assignment.provider_id) {
    throw new Error('A teacher, staff member, or provider must be assigned');
  }

  const { data, error } = await supabase
    .from('yard_duty_assignments')
    .insert({
      ...assignment,
      school_year: assignment.school_year || getCurrentSchoolYear(),
      created_by_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding yard duty assignment:', error);
    throw error;
  }

  return data;
}

/**
 * Update a yard duty assignment by id as a site admin.
 */
export async function updateYardDutyAssignment(
  id: string,
  schoolId: string,
  updates: {
    period_name?: string;
    zone_name?: string | null;
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    teacher_id?: string | null;
    staff_id?: string | null;
    provider_id?: string | null;
    assignee_name?: string;
  }
): Promise<YardDutyAssignment> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Verify admin permission via RLS (the query will fail if not authorized)
  const { data, error } = await supabase
    .from('yard_duty_assignments')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();

  if (error) {
    console.error('Error updating yard duty assignment:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Failed to update yard duty assignment');
  }

  return data;
}

/**
 * Delete a yard duty assignment by id.
 */
export async function deleteYardDutyAssignment(
  id: string,
  schoolId: string
): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('yard_duty_assignments')
    .delete()
    .eq('id', id)
    .eq('school_id', schoolId);

  if (error) {
    console.error('Error deleting yard duty assignment:', error);
    throw error;
  }
}
