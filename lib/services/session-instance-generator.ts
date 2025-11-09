import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];

interface InstanceGenerationResult {
  success: boolean;
  instancesCreated: number;
  instances?: ScheduleSession[];
  error?: string;
}

/**
 * Generates dated session instances from a template session
 * @param templateSession - The template session (with session_date = NULL)
 * @param weeksAhead - Number of weeks forward to generate instances
 * @returns Result with created instances
 */
export async function createInstancesFromTemplate(
  templateSession: ScheduleSession,
  weeksAhead: number = 8
): Promise<InstanceGenerationResult> {
  try {
    const supabase = await createClient();

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

      // Format as YYYY-MM-DD
      const dateStr = instanceDate.toISOString().split('T')[0];
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
        instances: [],
        error: 'All instances already exist'
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
      is_completed: false
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

    // Fetch all template sessions that are scheduled
    const { data: templates, error: fetchError } = await supabase
      .from('schedule_sessions')
      .select('*')
      .is('session_date', null)
      .not('day_of_week', 'is', null)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null);

    if (fetchError) {
      return {
        total: 0,
        created: 0,
        errors: [`Failed to fetch templates: ${fetchError.message}`]
      };
    }

    const errors: string[] = [];
    let totalCreated = 0;

    // Generate instances for each template
    for (const template of templates || []) {
      const result = await createInstancesFromTemplate(template, weeksAhead);

      if (result.success) {
        totalCreated += result.instancesCreated;
      } else if (result.error && !result.error.includes('already exist')) {
        errors.push(`Template ${template.id}: ${result.error}`);
      }
    }

    return {
      total: templates?.length || 0,
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
