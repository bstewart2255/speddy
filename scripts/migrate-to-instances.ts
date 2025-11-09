/**
 * Migration script to generate instances from existing template sessions
 *
 * This script migrates from template-only architecture to instance-based architecture
 * by generating dated instances for all existing template sessions.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-instances.ts
 *
 * Or with custom weeks:
 *   npx tsx scripts/migrate-to-instances.ts --weeks 12
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

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
 */
async function createInstancesFromTemplate(
  supabase: ReturnType<typeof createClient<Database>>,
  templateSession: ScheduleSession,
  weeksAhead: number = 8
): Promise<InstanceGenerationResult> {
  try {
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
    const targetDayOfWeek = templateSession.day_of_week;
    const currentDayOfWeek = today.getDay();

    // Calculate days until next occurrence (0-6)
    let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;
    if (daysUntilTarget < 0) {
      daysUntilTarget += 7;
    }

    // Generate dates for the next N weeks
    for (let week = 0; week < weeksAhead; week++) {
      const instanceDate = new Date(today);
      instanceDate.setDate(today.getDate() + daysUntilTarget + (week * 7));

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
 * Main migration function
 */
async function migrate() {
  const args = process.argv.slice(2);
  const weeksIndex = args.indexOf('--weeks');
  const weeksAhead = weeksIndex >= 0 ? parseInt(args[weeksIndex + 1]) : 8;

  console.log('🚀 Starting migration to instance-based architecture');
  console.log(`📅 Generating instances for ${weeksAhead} weeks ahead\n`);

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch all template sessions
  console.log('📋 Fetching template sessions...');
  const { data: templates, error: fetchError } = await supabase
    .from('schedule_sessions')
    .select('*')
    .is('session_date', null)
    .not('day_of_week', 'is', null)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null);

  if (fetchError) {
    console.error('❌ Error fetching templates:', fetchError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${templates?.length || 0} template sessions\n`);

  if (!templates || templates.length === 0) {
    console.log('✨ No templates to migrate');
    process.exit(0);
  }

  const errors: string[] = [];
  let totalCreated = 0;

  // Generate instances for each template
  console.log('⚙️  Generating instances...\n');
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const progress = `[${i + 1}/${templates.length}]`;

    process.stdout.write(`${progress} Processing template ${template.id}...`);

    const result = await createInstancesFromTemplate(supabase, template, weeksAhead);

    if (result.success) {
      totalCreated += result.instancesCreated;
      console.log(` ✓ Created ${result.instancesCreated} instances`);
    } else if (result.error && !result.error.includes('already exist')) {
      errors.push(`Template ${template.id}: ${result.error}`);
      console.log(` ✗ Error: ${result.error}`);
    } else {
      console.log(` - Skipped (already exists)`);
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   Templates processed: ${templates.length}`);
  console.log(`   Instances created: ${totalCreated}`);
  console.log(`   Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    errors.forEach(err => console.log(`   - ${err}`));
  }

  console.log('\n✅ Migration complete!');
}

// Run migration
migrate().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
