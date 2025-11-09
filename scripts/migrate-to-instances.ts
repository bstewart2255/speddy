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
import { createInstancesFromTemplate } from '../lib/services/session-instance-generator';
import type { ScheduleSession } from '../lib/services/session-instance-generator';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
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

    const result = await createInstancesFromTemplate(template, weeksAhead, supabase);

    if (result.success) {
      totalCreated += result.instancesCreated;
      if (result.instancesCreated > 0) {
        console.log(` ✓ Created ${result.instancesCreated} instances`);
      } else {
        console.log(` - Skipped (all instances already exist)`);
      }
    } else if (result.error) {
      errors.push(`Template ${template.id}: ${result.error}`);
      console.log(` ✗ Error: ${result.error}`);
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
