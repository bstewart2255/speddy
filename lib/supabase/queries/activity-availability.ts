import { createClient } from '@/lib/supabase/client';

export interface ActivityAvailability {
  id: string;
  school_id: string;
  activity_type: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface DayAvailability {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
}

// Default availability when no row exists (all days available)
const DEFAULT_AVAILABILITY: DayAvailability = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
};

/**
 * Get activity availability for a school.
 * Returns a Map of activity type -> day availability.
 * If an activity type has no row, it's considered available all days.
 */
export async function getActivityAvailability(
  schoolId: string
): Promise<Map<string, DayAvailability>> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('activity_type_availability')
    .select('*')
    .eq('school_id', schoolId);

  if (error) {
    console.error('Error fetching activity availability:', error);
    throw error;
  }

  const availabilityMap = new Map<string, DayAvailability>();

  for (const row of data || []) {
    availabilityMap.set(row.activity_type, {
      monday: row.monday,
      tuesday: row.tuesday,
      wednesday: row.wednesday,
      thursday: row.thursday,
      friday: row.friday,
    });
  }

  return availabilityMap;
}

/**
 * Get availability for a specific activity type at a school.
 * Returns default (all days available) if no row exists.
 */
export async function getActivityTypeAvailability(
  schoolId: string,
  activityType: string
): Promise<DayAvailability> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('activity_type_availability')
    .select('*')
    .eq('school_id', schoolId)
    .eq('activity_type', activityType)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned, which is fine (use defaults)
    console.error('Error fetching activity type availability:', error);
    throw error;
  }

  if (!data) {
    return { ...DEFAULT_AVAILABILITY };
  }

  return {
    monday: data.monday,
    tuesday: data.tuesday,
    wednesday: data.wednesday,
    thursday: data.thursday,
    friday: data.friday,
  };
}

/**
 * Insert or update activity availability for a specific activity type at a school.
 * Uses upsert to handle both create and update cases.
 */
export async function upsertActivityAvailability(
  schoolId: string,
  activityType: string,
  availability: DayAvailability
): Promise<ActivityAvailability> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('activity_type_availability')
    .upsert(
      {
        school_id: schoolId,
        activity_type: activityType,
        monday: availability.monday,
        tuesday: availability.tuesday,
        wednesday: availability.wednesday,
        thursday: availability.thursday,
        friday: availability.friday,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'school_id,activity_type',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error upserting activity availability:', error);
    throw error;
  }

  return data;
}

/**
 * Check if an activity type is available on a specific day at a school.
 * @param availability - Map of activity type -> day availability (from getActivityAvailability)
 * @param activityType - The activity type to check
 * @param dayOfWeek - Day number (1=Monday, 2=Tuesday, ..., 5=Friday)
 * @returns true if the activity is available on that day
 */
export function isActivityAvailableOnDay(
  availability: Map<string, DayAvailability>,
  activityType: string,
  dayOfWeek: number
): boolean {
  const dayAvailability = availability.get(activityType);

  // If no availability configured, assume all days available
  if (!dayAvailability) {
    return true;
  }

  switch (dayOfWeek) {
    case 1:
      return dayAvailability.monday;
    case 2:
      return dayAvailability.tuesday;
    case 3:
      return dayAvailability.wednesday;
    case 4:
      return dayAvailability.thursday;
    case 5:
      return dayAvailability.friday;
    default:
      return true;
  }
}

/**
 * Get the day name for a given day of week number.
 */
export function getDayName(dayOfWeek: number): string {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return days[dayOfWeek - 1] || '';
}
