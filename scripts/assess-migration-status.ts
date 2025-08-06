#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function assessMigrationStatus() {
  console.log('='.repeat(80));
  console.log('SCHOOL SYSTEM MIGRATION ASSESSMENT');
  console.log('='.repeat(80));
  console.log();

  try {
    // 1. Get overall migration statistics
    const { data: stats, error: statsError } = await supabase.rpc('get_school_migration_stats');
    
    if (statsError) {
      console.error('Error fetching migration stats:', statsError);
    } else if (stats && stats[0]) {
      console.log('📊 MIGRATION STATISTICS:');
      console.log('------------------------');
      console.log(`Total Users: ${stats[0].total_users}`);
      console.log(`Migrated Users: ${stats[0].migrated_users}`);
      console.log(`Unmigrated Users: ${stats[0].unmigrated_users}`);
      console.log(`Migration Percentage: ${stats[0].migration_percentage}%`);
      console.log();
    }

    // 2. Check unmigrated users details
    const { data: unmigrated, error: unmigratedError } = await supabase
      .from('profiles')
      .select('id, email, school_district, school_site, created_at')
      .is('school_id', null)
      .not('school_site', 'is', null)
      .limit(10);

    if (!unmigratedError && unmigrated) {
      console.log('🔍 SAMPLE UNMIGRATED USERS:');
      console.log('---------------------------');
      if (unmigrated.length === 0) {
        console.log('✅ No unmigrated users found!');
      } else {
        unmigrated.forEach(user => {
          console.log(`- ${user.email}`);
          console.log(`  District: ${user.school_district}`);
          console.log(`  School: ${user.school_site}`);
          console.log(`  Created: ${new Date(user.created_at).toLocaleDateString()}`);
        });
      }
      console.log();
    }

    // 3. Check for data quality issues
    console.log('🔧 DATA QUALITY CHECKS:');
    console.log('-----------------------');

    // Check for users with school_id but missing text fields
    const { count: hybridCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('school_id', 'is', null)
      .or('school_site.is.null,school_district.is.null');

    console.log(`Users with school_id but missing text fields: ${hybridCount || 0}`);

    // Check for orphaned school_ids
    const { data: orphanedProfiles } = await supabase
      .from('profiles')
      .select('id, school_id')
      .not('school_id', 'is', null)
      .limit(100);

    if (orphanedProfiles) {
      const schoolIds = [...new Set(orphanedProfiles.map(p => p.school_id))];
      const { data: validSchools } = await supabase
        .from('schools')
        .select('id')
        .in('id', schoolIds);

      const validSchoolIds = new Set(validSchools?.map(s => s.id) || []);
      const orphanedIds = schoolIds.filter(id => !validSchoolIds.has(id));
      
      console.log(`Orphaned school_id references: ${orphanedIds.length}`);
      if (orphanedIds.length > 0) {
        console.log('  Sample orphaned IDs:', orphanedIds.slice(0, 5));
      }
    }

    // 4. Check related tables
    console.log();
    console.log('📋 RELATED TABLES STATUS:');
    console.log('-------------------------');

    // Check students table
    const { count: studentsWithId } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .not('school_id', 'is', null);

    const { count: totalStudents } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    console.log(`Students: ${studentsWithId || 0}/${totalStudents || 0} migrated`);

    // Check bell_schedules table
    const { count: bellWithId } = await supabase
      .from('bell_schedules')
      .select('*', { count: 'exact', head: true })
      .not('school_id', 'is', null);

    const { count: totalBell } = await supabase
      .from('bell_schedules')
      .select('*', { count: 'exact', head: true });

    console.log(`Bell Schedules: ${bellWithId || 0}/${totalBell || 0} migrated`);

    // 5. Check database functions
    console.log();
    console.log('🔨 DATABASE FUNCTIONS:');
    console.log('----------------------');

    // Check if v2 function exists
    // Check if v2 function exists - simplified check
    const { error: funcError } = await supabase
      .rpc('find_all_team_members_v2', { 
        current_user_id: '00000000-0000-0000-0000-000000000000' 
      });

    console.log(`find_all_team_members_v2: ${!funcError || !funcError.message?.includes('does not exist') ? '✅ Exists' : '❌ Not found'}`);

    // 6. Performance metrics
    console.log();
    console.log('⚡ PERFORMANCE READINESS:');
    console.log('-------------------------');

    // Check indexes
    const { data: indexes } = await supabase.rpc('get_indexes', { 
      schema_name: 'public',
      table_name: 'profiles' 
    });

    const schoolIndexes = indexes?.filter((idx: any) => 
      idx.column_names?.includes('school_id') ||
      idx.column_names?.includes('district_id') ||
      idx.column_names?.includes('state_id')
    );

    console.log(`School-related indexes: ${schoolIndexes?.length || 0}`);

    // 7. Migration recommendations
    console.log();
    console.log('📌 RECOMMENDATIONS:');
    console.log('-------------------');

    const migrationPercentage = stats?.[0]?.migration_percentage || 0;

    if (migrationPercentage === 100) {
      console.log('✅ All users migrated! Ready for cleanup phase.');
      console.log('   - Safe to remove legacy columns');
      console.log('   - Can simplify database functions');
      console.log('   - Ready to optimize queries');
    } else if (migrationPercentage >= 95) {
      console.log('⚠️  Nearly complete. Consider:');
      console.log('   - Manual review of remaining unmigrated users');
      console.log('   - Forced migration with fallback data');
      console.log('   - Contact users for data verification');
    } else if (migrationPercentage >= 80) {
      console.log('🔄 Good progress. Next steps:');
      console.log('   - Continue automated migration efforts');
      console.log('   - Improve matching algorithms');
      console.log('   - Engage users to update their profiles');
    } else {
      console.log('❌ Significant work needed:');
      console.log('   - Review migration strategy');
      console.log('   - Improve school data quality');
      console.log('   - Consider batch processing tools');
    }

  } catch (error) {
    console.error('Error during assessment:', error);
  }
}

// Run the assessment
assessMigrationStatus().then(() => {
  console.log();
  console.log('='.repeat(80));
  console.log('Assessment complete!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});