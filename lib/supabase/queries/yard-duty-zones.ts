import { createClient } from '@/lib/supabase/client';

export interface YardDutyZone {
  id: string;
  school_id: string;
  zone_name: string;
  created_at: string | null;
}

/**
 * Fetch all yard duty zones for a school.
 */
export async function getYardDutyZones(schoolId: string): Promise<YardDutyZone[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('yard_duty_zones')
    .select('*')
    .eq('school_id', schoolId)
    .order('zone_name');

  if (error) {
    console.error('Error fetching yard duty zones:', error);
    throw error;
  }

  return data || [];
}

/**
 * Add a new yard duty zone for a school.
 */
export async function addYardDutyZone(
  schoolId: string,
  zoneName: string
): Promise<YardDutyZone> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('yard_duty_zones')
    .insert({ school_id: schoolId, zone_name: zoneName.trim() })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Zone "${zoneName.trim()}" already exists`);
    }
    console.error('Error adding yard duty zone:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a yard duty zone by id.
 */
export async function deleteYardDutyZone(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('yard_duty_zones')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting yard duty zone:', error);
    throw error;
  }
}
