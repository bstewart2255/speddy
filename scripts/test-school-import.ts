#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function testConnection() {
  console.log('🔍 Testing School Data Import Setup\n');
  console.log('====================================\n');

  // Check environment variables
  console.log('1️⃣  Checking environment variables...');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables!');
    console.error('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  console.log('✅ Environment variables configured\n');

  // Test Supabase connection
  console.log('2️⃣  Testing Supabase connection...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  try {
    // Check states table
    const { data: states, error: statesError } = await supabase
      .from('states')
      .select('count')
      .limit(1);
    
    if (statesError) {
      console.error('❌ Could not query states table:', statesError.message);
      console.error('   Please ensure the migration has been run');
      process.exit(1);
    }
    
    // Count states
    const { count: stateCount } = await supabase
      .from('states')
      .select('*', { count: 'exact', head: true });
    
    console.log(`✅ States table accessible (${stateCount || 0} states loaded)\n`);

    // Check districts table
    console.log('3️⃣  Checking districts table...');
    const { error: districtsError } = await supabase
      .from('districts')
      .select('count')
      .limit(1);
    
    if (districtsError) {
      console.error('❌ Could not query districts table:', districtsError.message);
      process.exit(1);
    }
    
    const { count: districtCount } = await supabase
      .from('districts')
      .select('*', { count: 'exact', head: true });
    
    console.log(`✅ Districts table accessible (${districtCount || 0} districts loaded)\n`);

    // Check schools table
    console.log('4️⃣  Checking schools table...');
    const { error: schoolsError } = await supabase
      .from('schools')
      .select('count')
      .limit(1);
    
    if (schoolsError) {
      console.error('❌ Could not query schools table:', schoolsError.message);
      process.exit(1);
    }
    
    const { count: schoolCount } = await supabase
      .from('schools')
      .select('*', { count: 'exact', head: true });
    
    console.log(`✅ Schools table accessible (${schoolCount || 0} schools loaded)\n`);

    // Test API connectivity (Urban Institute)
    console.log('5️⃣  Testing NCES API connectivity...');
    try {
      const axios = require('axios');
      const testUrl = 'https://educationdata.urban.org/api/v1/schools/ccd/directory/?year=2022&fips=06&page=1&per_page=1';
      const response = await axios.get(testUrl, { timeout: 10000 });
      
      if (response.data && response.data.results) {
        console.log('✅ NCES API is accessible\n');
      } else {
        console.log('⚠️  NCES API returned unexpected format');
        console.log('   Consider using CSV fallback method\n');
      }
    } catch (apiError: any) {
      console.log('⚠️  Could not reach NCES API:', apiError.message);
      console.log('   You may need to use CSV fallback method\n');
    }

    // Summary
    console.log('====================================\n');
    console.log('📊 Current Database Status:');
    console.log(`   States:    ${stateCount || 0} / 50+`);
    console.log(`   Districts: ${districtCount || 0} / ~15,000`);
    console.log(`   Schools:   ${schoolCount || 0} / ~130,000\n`);

    if ((districtCount || 0) === 0) {
      console.log('💡 Ready to import! Run: npm run populate:schools');
    } else if ((districtCount || 0) < 15000) {
      console.log('💡 Partial data exists. The import will resume from where it left off.');
      console.log('   Run: npm run populate:schools');
    } else {
      console.log('✅ Import appears to be complete!');
    }

    console.log('\n🎯 Test Import Command:');
    console.log('   npm run populate:schools:test\n');
    console.log('   This will import a small batch (10 records) for testing\n');

  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

// Run the test
testConnection().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});