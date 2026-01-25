import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/src/types/database';
import { formatDateLocal } from '@/lib/utils/date-helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
export type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];

/**
 * Gets the school year end date (June 30 of the current school year)
 * If we're past June 30, returns June 30 of next year
 */
export function getSchoolYearEndDate(): Date {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed (June = 5)

  // If we're past June (July onwards), use next year's June 30
  const targetYear = currentMonth > 5 ? currentYear + 1 : currentYear;

  // June 30 at end of day
  const endDate = new Date(targetYear, 5, 30, 23, 59, 59, 999);
  return endDate;
}

/**
 * Calculates the number of weeks from today until school year end (June 30)
 */
export function calculateWeeksUntilSchoolYearEnd(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = getSchoolYearEndDate();
  endDate.setHours(0, 0, 0, 0);

  const diffMs = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.ceil(diffDays / 7);

  // Ensure at least 1 week
  return Math.max(1, diffWeeks);
}

export interface InstanceGenerationResult {
  success: boolean;
  instancesCreated: number;
  instances?: ScheduleSession[];
  error?: string;
}

export interface InstanceGenerationOptions {
  /** Number of weeks forward to generate instances (default: calculate until school year end) */
  weeksAhead?: number;
  /** Generate until this specific date (takes precedence over weeksAhead) */
  untilDate?: Date;
  /** Use school year end date (June 30) - default behavior */
  useSchoolYearEnd?: boolean;
}

/**
 * Generates dated session instances from a template session
 * @param templateSession - The template session (with session_date = NULL)
 * @param optionsOrWeeksAhead - Options object or number of weeks (for backward compatibility)
 * @param supabaseClient - Optional Supabase client (creates one if not provided)
 * @returns Result with created instances
 */
export async function createInstancesFromTemplate(
  templateSession: ScheduleSession,
  optionsOrWeeksAhead: InstanceGenerationOptions | number = { useSchoolYearEnd: true },
  supabaseClient?: SupabaseClient<Database>
): Promise<InstanceGenerationResult> {
  try {
    const supabase = supabaseClient || await createClient();

    // Validation: Ensure this is a valid template session
    if (templateSession.session_date !== null) {
      return {
        success: false,
        instancesCreated: 0,
        error: 'Session already has a date - not a template'
      };
    }

    if (!templateSession.day_of_week || !templateSession.start_time || !templateSession.end_time) {
      return {
        success: false,
        instancesCreated: 0,
        error: 'Template session must have day_of_week, start_time, and end_time'
      };
    }

    if (!templateSession.student_id || !templateSession.provider_id) {
      return {
        success: false,
        instancesCreated: 0,
        error: 'Template session must have student_id and provider_id'
      };
    }

    // Parse options (backward compatibility: support number for weeksAhead)
    const options: InstanceGenerationOptions = typeof optionsOrWeeksAhead === 'number'
      ? { weeksAhead: optionsOrWeeksAhead }
      : optionsOrWeeksAhead;

    // Determine the end date for instance generation
    let endDate: Date;
    if (options.untilDate) {
      endDate = new Date(options.untilDate);
    } else if (options.weeksAhead !== undefined) {
      // Use explicit weeks ahead
      endDate = new Date();
      endDate.setDate(endDate.getDate() + (options.weeksAhead * 7));
    } else {
      // Default: use school year end (June 30)
      endDate = getSchoolYearEndDate();
    }
    endDate.setHours(23, 59, 59, 999);

    // Generate dates until end date
    const datesToCreate: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the next occurrence of the template's day_of_week
    const targetDayOfWeek = templateSession.day_of_week; // 0 = Sunday, 1 = Monday, etc.
    const currentDayOfWeek = today.getDay();

    // Calculate days until next occurrence (0-6)
    let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;
    if (daysUntilTarget < 0) {
      daysUntilTarget += 7; // Move to next week
    }

    // Generate dates until end date
    let week = 0;
    while (true) {
      const instanceDate = new Date(today);
      instanceDate.setDate(today.getDate() + daysUntilTarget + (week * 7));

      // Stop if we've gone past the end date
      if (instanceDate > endDate) {
        break;
      }

      // Format as YYYY-MM-DD in local timezone
      const dateStr = formatDateLocal(instanceDate);
      datesToCreate.push(dateStr);
      week++;
    }

    // Check which instances already exist
    const { data: existingInstances, error: checkError } = await supabase
      .from('schedule_sessions')
      .select('session_date')
      .eq('student_id', templateSession.student_id)
      .eq('provider_id', templateSession.provider_id)
      .eq('service_type', templateSession.service_type)
      .eq('day_of_week', templateSession.day_of_week)
      .eq('start_time', templateSession.start_time)
      .eq('end_time', templateSession.end_time)
      .in('session_date', datesToCreate)
      .not('session_date', 'is', null);

    if (checkError) {
      return {
        success: false,
        instancesCreated: 0,
        error: `Failed to check existing instances: ${checkError.message}`
      };
    }

    // Filter out dates that already have instances
    const existingDates = new Set(
      existingInstances?.map(inst => inst.session_date).filter(Boolean) || []
    );
    const datesToInsert = datesToCreate.filter(date => !existingDates.has(date));

    if (datesToInsert.length === 0) {
      return {
        success: true,
        instancesCreated: 0,
        instances: []
      };
    }

    // Create instance rows
    const instancesToInsert: ScheduleSessionInsert[] = datesToInsert.map(date => ({
      student_id: templateSession.student_id,
      provider_id: templateSession.provider_id,
      day_of_week: templateSession.day_of_week,
      start_time: templateSession.start_time,
      end_time: templateSession.end_time,
      service_type: templateSession.service_type,
      session_date: date,
      delivered_by: templateSession.delivered_by,
      assigned_to_specialist_id: templateSession.assigned_to_specialist_id,
      assigned_to_sea_id: templateSession.assigned_to_sea_id,
      manually_placed: templateSession.manually_placed,
      group_id: templateSession.group_id,
      group_name: templateSession.group_name,
      status: templateSession.status,
      student_absent: false,
      outside_schedule_conflict: false,
      is_completed: false,
      template_id: templateSession.id,
      is_template: false
    }));

    // Insert instances
    const { data: createdInstances, error: insertError } = await supabase
      .from('schedule_sessions')
      .insert(instancesToInsert)
      .select();

    if (insertError) {
      return {
        success: false,
        instancesCreated: 0,
        error: `Failed to create instances: ${insertError.message}`
      };
    }

    return {
      success: true,
      instancesCreated: createdInstances?.length || 0,
      instances: createdInstances || []
    };
  } catch (error) {
    return {
      success: false,
      instancesCreated: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generates instances for all scheduled templates
 * Used for migration and batch operations
 * @param optionsOrWeeksAhead - Options object or number of weeks (for backward compatibility)
 */
export async function generateInstancesForAllTemplates(
  optionsOrWeeksAhead: InstanceGenerationOptions | number = { useSchoolYearEnd: true }
): Promise<{ total: number; created: number; errors: string[]; endDate: string }> {
  try {
    const supabase = await createClient();

    // Parse options (backward compatibility: support number for weeksAhead)
    const options: InstanceGenerationOptions = typeof optionsOrWeeksAhead === 'number'
      ? { weeksAhead: optionsOrWeeksAhead }
      : optionsOrWeeksAhead;

    // Calculate end date for logging
    let endDate: Date;
    if (options.untilDate) {
      endDate = new Date(options.untilDate);
    } else if (options.weeksAhead !== undefined) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + (options.weeksAhead * 7));
    } else {
      endDate = getSchoolYearEndDate();
    }
    const endDateStr = formatDateLocal(endDate);

    // Fetch all template sessions that are scheduled with pagination
    const allTemplates: ScheduleSession[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select('*')
        .is('session_date', null)
        .not('day_of_week', 'is', null)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return {
          total: 0,
          created: 0,
          errors: [`Failed to fetch templates: ${error.message}`],
          endDate: endDateStr
        };
      }

      if (!data || data.length === 0) break;

      allTemplates.push(...data);

      if (data.length < PAGE_SIZE) break;

      from += PAGE_SIZE;
    }

    const errors: string[] = [];
    let totalCreated = 0;

    // Generate instances for each template in batches for better performance
    const BATCH_SIZE = 10;

    for (let i = 0; i < allTemplates.length; i += BATCH_SIZE) {
      const batch = allTemplates.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(template => createInstancesFromTemplate(template, options))
      );

      results.forEach((result, idx) => {
        const template = batch[idx];
        if (result.success) {
          totalCreated += result.instancesCreated;
        } else if (result.error) {
          errors.push(`Template ${template.id}: ${result.error}`);
        }
      });
    }

    return {
      total: allTemplates.length,
      created: totalCreated,
      errors,
      endDate: endDateStr
    };
  } catch (error) {
    return {
      total: 0,
      created: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      endDate: ''
    };
  }
}
