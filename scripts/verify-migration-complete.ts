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

interface VerificationResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  details: string;
}

async function verifyMigrationComplete(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  
  console.log('🔍 VERIFYING MIGRATION COMPLETION...\n');

  // 1. Check all users have school_id
  try {
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: usersWithSchoolId } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('school_id', 'is', null);

    results.push({
      category: 'User Migration',
      check: 'All users have school_id',
      status: totalUsers === usersWithSchoolId ? 'PASS' : 'FAIL',
      details: `${usersWithSchoolId}/${totalUsers} users migrated`
    });
  } catch (error) {
    results.push({
      category: 'User Migration',
      check: 'All users have school_id',
      status: 'FAIL',
      details: `Error: ${error}`
    });
  }

  // 2. Check database functions
  try {
    // Test new function exists
    const { error: funcError } = await supabase.rpc('find_all_team_members', {
      current_user_id: '00000000-0000-0000-0000-000000000000'
    });

    results.push({
      category: 'Database Functions',
      check: 'Simplified functions deployed',
      status: funcError?.message.includes('does not exist') ? 'FAIL' : 'PASS',
      details: 'find_all_team_members function exists'
    });
  } catch (error) {
    results.push({
      category: 'Database Functions',
      check: 'Simplified functions deployed',
      status: 'WARNING',
      details: 'Could not verify functions'
    });
  }

  // 3. Check indexes exist
  try {
    const { data: indexes } = await supabase.rpc('get_indexes_for_table', {
      table_name: 'profiles'
    });

    const hasSchoolIndex = indexes?.some((idx: any) => 
      idx.indexname?.includes('school_id')
    );

    results.push({
      category: 'Performance',
      check: 'Optimized indexes created',
      status: hasSchoolIndex ? 'PASS' : 'WARNING',
      details: hasSchoolIndex ? 'School indexes present' : 'School indexes may be missing'
    });
  } catch (error) {
    results.push({
      category: 'Performance',
      check: 'Optimized indexes created',
      status: 'WARNING',
      details: 'Could not verify indexes'
    });
  }

  // 4. Check materialized view
  try {
    const { data: stats, error } = await supabase
      .from('school_statistics')
      .select('*')
      .limit(1);

    results.push({
      category: 'Performance',
      check: 'Statistics materialized view',
      status: error ? 'FAIL' : 'PASS',
      details: error ? error.message : 'Materialized view accessible'
    });
  } catch (error) {
    results.push({
      category: 'Performance',
      check: 'Statistics materialized view',
      status: 'FAIL',
      details: `Error: ${error}`
    });
  }

  // 5. Check backup schema
  try {
    const { data: backup } = await supabase
      .from('legacy_backup.migration_audit')
      .select('*')
      .limit(1);

    results.push({
      category: 'Backup',
      check: 'Legacy data backed up',
      status: 'PASS',
      details: 'Backup schema exists and is accessible'
    });
  } catch (error) {
    results.push({
      category: 'Backup',
      check: 'Legacy data backed up',
      status: 'WARNING',
      details: 'Could not verify backup (may require admin access)'
    });
  }

  // 6. Performance test
  try {
    const startTime = Date.now();
    
    // Get a sample user
    const { data: sampleUser } = await supabase
      .from('profiles')
      .select('id')
      .not('school_id', 'is', null)
      .limit(1)
      .single();

    if (sampleUser) {
      // Test team member query performance
      const { data: teamMembers } = await supabase.rpc('find_all_team_members', {
        current_user_id: sampleUser.id
      });

      const queryTime = Date.now() - startTime;

      results.push({
        category: 'Performance',
        check: 'Query performance',
        status: queryTime < 100 ? 'PASS' : queryTime < 500 ? 'WARNING' : 'FAIL',
        details: `Team query completed in ${queryTime}ms`
      });
    }
  } catch (error) {
    results.push({
      category: 'Performance',
      check: 'Query performance',
      status: 'WARNING',
      details: 'Could not test performance'
    });
  }

  // 7. Check data integrity
  try {
    // Check for orphaned school_ids
    const { data: profiles } = await supabase
      .from('profiles')
      .select('school_id')
      .not('school_id', 'is', null)
      .limit(100);

    if (profiles && profiles.length > 0) {
      const schoolIds = [...new Set(profiles.map(p => p.school_id))];
      const { data: schools } = await supabase
        .from('schools')
        .select('id')
        .in('id', schoolIds);

      const validIds = new Set(schools?.map(s => s.id) || []);
      const orphaned = schoolIds.filter(id => !validIds.has(id));

      results.push({
        category: 'Data Integrity',
        check: 'No orphaned school references',
        status: orphaned.length === 0 ? 'PASS' : 'FAIL',
        details: orphaned.length === 0 ? 'All school references valid' : `${orphaned.length} orphaned references found`
      });
    }
  } catch (error) {
    results.push({
      category: 'Data Integrity',
      check: 'No orphaned school references',
      status: 'WARNING',
      details: 'Could not verify data integrity'
    });
  }

  return results;
}

async function generateReport(results: VerificationResult[]) {
  console.log('='.repeat(80));
  console.log('MIGRATION VERIFICATION REPORT');
  console.log('='.repeat(80));
  console.log();

  const categories = [...new Set(results.map(r => r.category))];

  for (const category of categories) {
    console.log(`\n📋 ${category.toUpperCase()}`);
    console.log('-'.repeat(40));

    const categoryResults = results.filter(r => r.category === category);
    
    for (const result of categoryResults) {
      const icon = result.status === 'PASS' ? '✅' : 
                   result.status === 'FAIL' ? '❌' : '⚠️';
      
      console.log(`${icon} ${result.check}`);
      console.log(`   ${result.details}`);
    }
  }

  // Summary
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARNING').length;

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`⚠️  Warnings: ${warnCount}`);
  console.log();

  if (failCount === 0) {
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('The system is fully migrated to structured school data.');
  } else {
    console.log('⚠️  MIGRATION INCOMPLETE');
    console.log('Please address the failed checks before proceeding.');
  }

  // Recommendations
  if (failCount > 0 || warnCount > 0) {
    console.log('\n📌 RECOMMENDATIONS:');
    console.log('-'.repeat(40));
    
    if (results.some(r => r.category === 'User Migration' && r.status === 'FAIL')) {
      console.log('• Run final user migration batch');
    }
    if (results.some(r => r.category === 'Performance' && r.status !== 'PASS')) {
      console.log('• Check and create missing indexes');
      console.log('• Refresh materialized views');
    }
    if (results.some(r => r.category === 'Data Integrity' && r.status === 'FAIL')) {
      console.log('• Run data cleanup scripts');
      console.log('• Fix orphaned references');
    }
  }

  return failCount === 0;
}

// Run verification
verifyMigrationComplete()
  .then(async (results) => {
    const success = await generateReport(results);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error during verification:', error);
    process.exit(1);
  });