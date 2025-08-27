// Debug script to identify RLS issues with profiles table
// Run with: node debug_rls_issue.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test credentials from environment variables
const TEST_USER_ID = process.env.TEST_USER_ID || '43241323-d9a7-4c88-99a9-e7b2633ba592';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  console.error('Missing environment variables. Please check .env.local');
  process.exit(1);
}

// Create two clients - one with anon key (RLS enforced) and one with service role (bypasses RLS)
// Disable session persistence for CLI-style debugging
const supabaseWithRLS = createClient(supabaseUrl, supabaseAnonKey, { 
  auth: { persistSession: false, autoRefreshToken: false }
});
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { 
  auth: { persistSession: false, autoRefreshToken: false }
});

async function debugRLSIssue() {
  console.log('='.repeat(80));
  console.log('RLS DEBUGGING FOR PROFILES TABLE');
  console.log('='.repeat(80));
  console.log(`Test User ID: ${TEST_USER_ID}\n`);

  try {
    // Step 1: Check if RLS is enabled
    console.log('1. CHECKING RLS STATUS ON PROFILES TABLE');
    console.log('-'.repeat(40));
    const { data: rlsStatus, error: rlsError } = await supabaseAdmin
      .rpc('raw_sql', {
        query: `
          SELECT tablename, rowsecurity 
          FROM pg_tables 
          WHERE schemaname = 'public' AND tablename = 'profiles'
        `
      })
      .single();
    
    if (rlsError) {
      // Try alternative query
      const { data: tables, error: tablesError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .limit(0);
      
      console.log('RLS check via query test:', !tablesError ? 'Table accessible' : 'Table not accessible');
    } else {
      console.log('RLS Status:', rlsStatus);
    }

    // Step 2: Get user's profile without RLS (admin)
    console.log('\n2. USER PROFILE (WITHOUT RLS - ADMIN)');
    console.log('-'.repeat(40));
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', TEST_USER_ID)
      .single();
    
    if (userError) {
      console.error('Error fetching user profile:', userError);
    } else {
      console.log('User Profile:', {
        id: userProfile.id,
        full_name: userProfile.full_name,
        role: userProfile.role,
        school_id: userProfile.school_id,
        school_site: userProfile.school_site,
        school_district: userProfile.school_district,
        works_at_multiple_schools: userProfile.works_at_multiple_schools
      });
    }

    // Step 3: Check provider_schools
    console.log('\n3. PROVIDER SCHOOLS (WITHOUT RLS - ADMIN)');
    console.log('-'.repeat(40));
    const { data: providerSchools, error: psError } = await supabaseAdmin
      .from('provider_schools')
      .select('*')
      .eq('provider_id', TEST_USER_ID);
    
    if (psError) {
      console.error('Error fetching provider schools:', psError);
    } else {
      console.log(`Found ${providerSchools?.length || 0} schools for this provider`);
      providerSchools?.forEach(ps => {
        console.log(`  - School ID: ${ps.school_id}`);
      });
    }

    // Step 4: Test with authenticated user (RLS enforced)
    console.log('\n4. TESTING WITH AUTHENTICATED USER (RLS ENFORCED)');
    console.log('-'.repeat(40));
    
    // First sign in as the user (if credentials provided)
    if (TEST_USER_EMAIL && TEST_USER_PASSWORD) {
      const { data: authData, error: authError } = await supabaseWithRLS.auth.signInWithPassword({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      });

      if (authError) {
        console.log('Authentication failed:', authError.message);
        console.log('Attempting to test with anon access...');
      } else {
        console.log('Successfully authenticated as user');
      }
    } else {
      console.log('Note: TEST_USER_EMAIL and TEST_USER_PASSWORD not set in environment');
      console.log('Skipping authenticated tests. Testing with anon access only...');
    }

    // Test various queries
    console.log('\n5. TESTING DIFFERENT QUERY PATTERNS');
    console.log('-'.repeat(40));

    // Test 1: Simple select
    console.log('\nTest 1: Simple select by ID');
    const { data: test1, error: error1 } = await supabaseWithRLS
      .from('profiles')
      .select('role')
      .eq('id', TEST_USER_ID);
    console.log('Result:', error1 ? `ERROR: ${error1.message}` : `Success - ${JSON.stringify(test1)}`);

    // Test 2: Select all fields
    console.log('\nTest 2: Select all fields');
    const { data: test2, error: error2 } = await supabaseWithRLS
      .from('profiles')
      .select('*')
      .eq('id', TEST_USER_ID);
    console.log('Result:', error2 ? `ERROR: ${error2.message}` : `Success - ${test2?.length} records`);

    // Test 3: Select specific fields
    console.log('\nTest 3: Select specific fields');
    const { data: test3, error: error3 } = await supabaseWithRLS
      .from('profiles')
      .select('works_at_multiple_schools,school_site,school_district,school_id,district_id,state_id')
      .eq('id', TEST_USER_ID);
    console.log('Result:', error3 ? `ERROR: ${error3.message}` : `Success - ${JSON.stringify(test3)}`);

    // Step 6: Check RLS policies
    console.log('\n6. CHECKING RLS POLICIES ON PROFILES TABLE');
    console.log('-'.repeat(40));
    const { data: policies, error: polError } = await supabaseAdmin
      .rpc('raw_sql', {
        query: `
          SELECT 
            polname as policy_name,
            polcmd as command,
            pg_get_expr(polqual, polrelid) as using_expression
          FROM pg_policy
          WHERE polrelid = 'public.profiles'::regclass
        `
      });
    
    if (!polError && policies) {
      console.log('Active RLS Policies:');
      policies.forEach(policy => {
        console.log(`\nPolicy: ${policy.policy_name}`);
        console.log(`Command: ${policy.command}`);
        console.log(`Using: ${policy.using_expression}`);
      });
    }

    // Step 7: Check for functions
    console.log('\n7. CHECKING SECURITY DEFINER FUNCTIONS');
    console.log('-'.repeat(40));
    const { data: functions, error: funcError } = await supabaseAdmin
      .rpc('raw_sql', {
        query: `
          SELECT 
            proname as function_name,
            prosecdef as is_security_definer
          FROM pg_proc
          WHERE pronamespace = 'public'::regnamespace
          AND proname LIKE '%school%'
        `
      });
    
    if (!funcError && functions) {
      console.log('School-related functions:');
      functions.forEach(func => {
        console.log(`  - ${func.function_name} (Security Definer: ${func.is_security_definer})`);
      });
    }

    // Step 8: Test the actual problematic queries
    console.log('\n8. TESTING ACTUAL PROBLEMATIC QUERIES');
    console.log('-'.repeat(40));
    
    const problematicQueries = [
      { 
        name: 'Query 1: select role',
        query: () => supabaseWithRLS.from('profiles').select('role').eq('id', TEST_USER_ID)
      },
      {
        name: 'Query 2: select all',
        query: () => supabaseWithRLS.from('profiles').select('*').eq('id', TEST_USER_ID)
      },
      {
        name: 'Query 3: select school fields',
        query: () => supabaseWithRLS.from('profiles').select('works_at_multiple_schools,school_site,school_district,school_id,district_id,state_id').eq('id', TEST_USER_ID)
      }
    ];

    for (const test of problematicQueries) {
      console.log(`\n${test.name}`);
      const start = Date.now();
      const { data, error } = await test.query();
      const duration = Date.now() - start;
      
      if (error) {
        console.log(`  ❌ ERROR (${duration}ms): ${error.message}`);
        if (error.details) console.log(`     Details: ${error.details}`);
        if (error.hint) console.log(`     Hint: ${error.hint}`);
      } else {
        console.log(`  ✅ SUCCESS (${duration}ms): ${data?.length || 0} records`);
      }
    }

    // Step 9: Test without RLS (admin) for comparison
    console.log('\n9. SAME QUERIES WITHOUT RLS (ADMIN)');
    console.log('-'.repeat(40));
    
    const adminQueries = [
      { 
        name: 'Query 1: select role',
        query: () => supabaseAdmin.from('profiles').select('role').eq('id', TEST_USER_ID)
      },
      {
        name: 'Query 2: select all',
        query: () => supabaseAdmin.from('profiles').select('*').eq('id', TEST_USER_ID)
      },
      {
        name: 'Query 3: select school fields',
        query: () => supabaseAdmin.from('profiles').select('works_at_multiple_schools,school_site,school_district,school_id,district_id,state_id').eq('id', TEST_USER_ID)
      }
    ];

    for (const test of adminQueries) {
      console.log(`\n${test.name}`);
      const start = Date.now();
      const { data, error } = await test.query();
      const duration = Date.now() - start;
      
      if (error) {
        console.log(`  ❌ ERROR (${duration}ms): ${error.message}`);
      } else {
        console.log(`  ✅ SUCCESS (${duration}ms): ${data?.length || 0} records`);
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }

  console.log('\n' + '='.repeat(80));
  console.log('DEBUGGING COMPLETE');
  console.log('='.repeat(80));
}

// Run the debug script
debugRLSIssue().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});