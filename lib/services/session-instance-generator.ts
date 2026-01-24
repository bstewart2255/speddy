import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/src/types/database';
import { formatDateLocal } from '@/lib/utils/date-helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
export type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];

export interface InstanceGenerationResult {
  success: boolean;
  instancesCreated: number;
  instances?: ScheduleSession[];
  error?: string;
}

/**
 * Generates dated session instances from a template session
 * @param templateSession - The template session (with session_date = NULL)
 * @param weeksAhead - Number of weeks forward to generate instances
 * @param supabaseClient - Optional Supabase client (creates one if not provided)
 * @returns Result with created instances
 */
export async function createInstancesFromTemplate(
  templateSession: ScheduleSession,
  weeksAhead: number = 8,
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

    // Generate dates for the next N weeks
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

    // Generate dates for the next N weeks
    for (let week = 0; week < weeksAhead; week++) {
      const instanceDate = new Date(today);
      instanceDate.setDate(today.getDate() + daysUntilTarget + (week * 7));

      // Format as YYYY-MM-DD in local timezone
      const dateStr = formatDateLocal(instanceDate);
      datesToCreate.push(dateStr);
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
 */
export async function generateInstancesForAllTemplates(
  weeksAhead: number = 8
): Promise<{ total: number; created: number; errors: string[] }> {
  try {
    const supabase = await createClient();

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
          errors: [`Failed to fetch templates: ${error.message}`]
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
        batch.map(template => createInstancesFromTemplate(template, weeksAhead))
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
      errors
    };
  } catch (error) {
    return {
      total: 0,
      created: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}
