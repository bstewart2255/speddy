import { createClient } from '@/lib/supabase/client';

export interface TimeRange {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

export interface DayConfig {
  available: boolean;
  timeRange?: TimeRange; // Optional: if set, restricts to specific hours
}

export interface ActivityAvailability {
  id: string;
  school_id: string;
  activity_type: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  monday_start_time: string | null;
  monday_end_time: string | null;
  tuesday_start_time: string | null;
  tuesday_end_time: string | null;
  wednesday_start_time: string | null;
  wednesday_end_time: string | null;
  thursday_start_time: string | null;
  thursday_end_time: string | null;
  friday_start_time: string | null;
  friday_end_time: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Simple boolean-only interface for backwards compatibility
export interface DayAvailability {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
}

// Extended interface with time ranges
export interface DayAvailabilityWithTimes {
  monday: DayConfig;
  tuesday: DayConfig;
  wednesday: DayConfig;
  thursday: DayConfig;
  friday: DayConfig;
  useTimeRanges: boolean; // Toggle for whether time ranges are enabled
}

// Default availability when no row exists (all days available, no time restrictions)
const DEFAULT_AVAILABILITY: DayAvailability = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
};

const DEFAULT_AVAILABILITY_WITH_TIMES: DayAvailabilityWithTimes = {
  monday: { available: true },
  tuesday: { available: true },
  wednesday: { available: true },
  thursday: { available: true },
  friday: { available: true },
  useTimeRanges: false,
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
 * Helper to extract time range from database row
 */
function extractTimeRange(startTime: string | null, endTime: string | null): TimeRange | undefined {
  if (startTime && endTime) {
    // Database returns time as "HH:MM:SS", we want "HH:MM"
    return {
      start: startTime.substring(0, 5),
      end: endTime.substring(0, 5),
    };
  }
  return undefined;
}

/**
 * Get availability with time ranges for a specific activity type at a school.
 * Returns default (all days available, no time restrictions) if no row exists.
 */
export async function getActivityTypeAvailabilityWithTimes(
  schoolId: string,
  activityType: string
): Promise<DayAvailabilityWithTimes> {
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
    console.error('Error fetching activity type availability:', error);
    throw error;
  }

  if (!data) {
    return { ...DEFAULT_AVAILABILITY_WITH_TIMES };
  }

  // Check if any time ranges are set
  const hasTimeRanges = !!(
    data.monday_start_time || data.tuesday_start_time ||
    data.wednesday_start_time || data.thursday_start_time ||
    data.friday_start_time
  );

  return {
    monday: {
      available: data.monday,
      timeRange: extractTimeRange(data.monday_start_time, data.monday_end_time)
    },
    tuesday: {
      available: data.tuesday,
      timeRange: extractTimeRange(data.tuesday_start_time, data.tuesday_end_time)
    },
    wednesday: {
      available: data.wednesday,
      timeRange: extractTimeRange(data.wednesday_start_time, data.wednesday_end_time)
    },
    thursday: {
      available: data.thursday,
      timeRange: extractTimeRange(data.thursday_start_time, data.thursday_end_time)
    },
    friday: {
      available: data.friday,
      timeRange: extractTimeRange(data.friday_start_time, data.friday_end_time)
    },
    useTimeRanges: hasTimeRanges,
  };
}

/**
 * Insert or update activity availability for a specific activity type at a school.
 * Uses upsert to handle both create and update cases.
 * @deprecated Use upsertActivityAvailabilityWithTimes instead
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
 * Insert or update activity availability with time ranges for a specific activity type at a school.
 */
export async function upsertActivityAvailabilityWithTimes(
  schoolId: string,
  activityType: string,
  availability: DayAvailabilityWithTimes
): Promise<ActivityAvailability> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  // Build the upsert data
  const upsertData: Record<string, unknown> = {
    school_id: schoolId,
    activity_type: activityType,
    monday: availability.monday.available,
    tuesday: availability.tuesday.available,
    wednesday: availability.wednesday.available,
    thursday: availability.thursday.available,
    friday: availability.friday.available,
    updated_at: new Date().toISOString(),
  };

  // Add time ranges if enabled
  if (availability.useTimeRanges) {
    upsertData.monday_start_time = availability.monday.timeRange?.start || null;
    upsertData.monday_end_time = availability.monday.timeRange?.end || null;
    upsertData.tuesday_start_time = availability.tuesday.timeRange?.start || null;
    upsertData.tuesday_end_time = availability.tuesday.timeRange?.end || null;
    upsertData.wednesday_start_time = availability.wednesday.timeRange?.start || null;
    upsertData.wednesday_end_time = availability.wednesday.timeRange?.end || null;
    upsertData.thursday_start_time = availability.thursday.timeRange?.start || null;
    upsertData.thursday_end_time = availability.thursday.timeRange?.end || null;
    upsertData.friday_start_time = availability.friday.timeRange?.start || null;
    upsertData.friday_end_time = availability.friday.timeRange?.end || null;
  } else {
    // Clear time ranges when toggle is off
    upsertData.monday_start_time = null;
    upsertData.monday_end_time = null;
    upsertData.tuesday_start_time = null;
    upsertData.tuesday_end_time = null;
    upsertData.wednesday_start_time = null;
    upsertData.wednesday_end_time = null;
    upsertData.thursday_start_time = null;
    upsertData.thursday_end_time = null;
    upsertData.friday_start_time = null;
    upsertData.friday_end_time = null;
  }

  const { data, error } = await supabase
    .from('activity_type_availability')
    .upsert(upsertData, {
      onConflict: 'school_id,activity_type',
    })
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

/**
 * Get all configured activity types for a school.
 * Returns array of activity type names that have availability configured.
 */
export async function getConfiguredActivityTypes(
  schoolId: string
): Promise<string[]> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('activity_type_availability')
    .select('activity_type')
    .eq('school_id', schoolId)
    .order('activity_type');

  if (error) {
    console.error('Error fetching configured activity types:', error);
    throw error;
  }

  return (data || []).map(row => row.activity_type);
}

/**
 * Delete activity availability configuration for a specific activity type at a school.
 * This only removes the availability config, not any scheduled activities.
 */
export async function deleteActivityAvailability(
  schoolId: string,
  activityType: string
): Promise<void> {
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { error } = await supabase
    .from('activity_type_availability')
    .delete()
    .eq('school_id', schoolId)
    .eq('activity_type', activityType);

  if (error) {
    console.error('Error deleting activity availability:', error);
    throw error;
  }
}
