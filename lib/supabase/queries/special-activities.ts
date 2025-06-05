import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../types/database';

type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type InsertSpecialActivity = Database['public']['Tables']['special_activities']['Insert'];

export async function getSpecialActivities() {
  const supabase = createClientComponentClient<Database>();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('special_activities')
    .select('*')
    .order('teacher_name', { ascending: true })
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addSpecialActivity(activity: Omit<InsertSpecialActivity, 'id' | 'provider_id' | 'created_at'>) {
  const supabase = createClientComponentClient<Database>();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('special_activities')
    .insert({
      ...activity,
      provider_id: user.user.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSpecialActivity(id: string) {
  const supabase = createClientComponentClient<Database>();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('special_activities')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deleteTeacherActivities(teacherName: string) {
  const supabase = createClientComponentClient<Database>();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('special_activities')
    .delete()
    .eq('teacher_name', teacherName);

  if (error) throw error;
}