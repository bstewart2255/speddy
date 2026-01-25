#!/usr/bin/env npx tsx
/**
 * Backfill script to generate session instances through June 30, 2026
 * Run with: npx tsx scripts/backfill-instances.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSchoolYearEndDate(): Date {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const targetYear = currentMonth > 5 ? currentYear + 1 : currentYear;
  return new Date(targetYear, 5, 30, 23, 59, 59, 999);
}

async function main() {
  console.log('Starting backfill of session instances...\n');

  // Get current counts
  const { count: beforeInstances } = await supabase
    .from('schedule_sessions')
    .select('*', { count: 'exact', head: true })
    .not('session_date', 'is', null);

  console.log(`Current instance count: ${beforeInstances}`);

  // Fetch all templates
  const { data: templates, error: fetchError } = await supabase
    .from('schedule_sessions')
    .select('*')
    .is('session_date', null)
    .not('day_of_week', 'is', null)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null);

  if (fetchError) {
    console.error('Error fetching templates:', fetchError);
    process.exit(1);
  }

  console.log(`Found ${templates?.length || 0} templates to process`);

  const endDate = getSchoolYearEndDate();
  console.log(`Generating instances through: ${formatDateLocal(endDate)}\n`);

  let totalCreated = 0;
  let errors: string[] = [];

  for (const template of templates || []) {
    if (!template.student_id || !template.provider_id || template.day_of_week === null) {
      continue;
    }

    // Generate dates for this template
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDayOfWeek = template.day_of_week;
    const currentDayOfWeek = today.getDay();

    let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;
    if (daysUntilTarget < 0) {
      daysUntilTarget += 7;
    }

    const datesToCreate: string[] = [];
    let week = 0;
    while (true) {
      const instanceDate = new Date(today);
      instanceDate.setDate(today.getDate() + daysUntilTarget + (week * 7));

      if (instanceDate > endDate) break;

      datesToCreate.push(formatDateLocal(instanceDate));
      week++;
    }

    if (datesToCreate.length === 0) continue;

    // Check which instances already exist
    const { data: existingInstances } = await supabase
      .from('schedule_sessions')
      .select('session_date')
      .eq('student_id', template.student_id)
      .eq('provider_id', template.provider_id)
      .eq('service_type', template.service_type)
      .eq('day_of_week', template.day_of_week)
      .eq('start_time', template.start_time)
      .eq('end_time', template.end_time)
      .in('session_date', datesToCreate)
      .not('session_date', 'is', null);

    const existingDates = new Set(
      existingInstances?.map(inst => inst.session_date).filter(Boolean) || []
    );
    const datesToInsert = datesToCreate.filter(date => !existingDates.has(date));

    if (datesToInsert.length === 0) continue;

    // Create instances
    const instancesToInsert = datesToInsert.map(date => ({
      student_id: template.student_id,
      provider_id: template.provider_id,
      day_of_week: template.day_of_week,
      start_time: template.start_time,
      end_time: template.end_time,
      service_type: template.service_type,
      session_date: date,
      delivered_by: template.delivered_by,
      assigned_to_specialist_id: template.assigned_to_specialist_id,
      assigned_to_sea_id: template.assigned_to_sea_id,
      manually_placed: template.manually_placed,
      group_id: template.group_id,
      group_name: template.group_name,
      status: template.status,
      student_absent: false,
      outside_schedule_conflict: false,
      is_completed: false,
      template_id: template.id,
      is_template: false
    }));

    const { data: created, error: insertError } = await supabase
      .from('schedule_sessions')
      .insert(instancesToInsert)
      .select();

    if (insertError) {
      errors.push(`Template ${template.id}: ${insertError.message}`);
    } else {
      totalCreated += created?.length || 0;
    }
  }

  // Get final counts
  const { count: afterInstances } = await supabase
    .from('schedule_sessions')
    .select('*', { count: 'exact', head: true })
    .not('session_date', 'is', null);

  console.log('\n--- Results ---');
  console.log(`Instances before: ${beforeInstances}`);
  console.log(`Instances after: ${afterInstances}`);
  console.log(`New instances created: ${totalCreated}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  console.log('\nBackfill complete!');
}

main().catch(console.error);
