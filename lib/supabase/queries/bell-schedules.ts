import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../src/types/database';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Insert'];

export async function addBellSchedule(schedule: Omit<BellSchedule, 'id' | 'created_at' | 'updated_at'>) {
  const supabase = createClientComponentClient<Database>();

  const { data, error } = await supabase
    .from('bell_schedules')
    .insert([schedule])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBellSchedule(id: string) {
  const supabase = createClientComponentClient<Database>();

  const { error } = await supabase
    .from('bell_schedules')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deleteGradeSchedules(gradeLevel: string) {
  const supabase = createClientComponentClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bell_schedules')
    .delete()
    .eq('grade_level', gradeLevel)
    .eq('provider_id', user.id);

  if (error) throw error;
}

export async function getBellSchedules() {
  const supabase = createClientComponentClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bell_schedules')
    .select('*')
    .eq('provider_id', user.id)
    .order('grade_level', { ascending: true })
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}