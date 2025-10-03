#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Validates California districts coverage in the database
 * Compares against expected totals and identifies gaps
 */
async function validateCaliforniaDistrictsCoverage() {
  console.log('🔍 California Districts Coverage Validation Report');
  console.log('=' .repeat(60));

  try {
    // 1. Get total districts count
    const { count: totalDistricts } = await supabase
      .from('districts')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA');

    // 2. Get districts by type (based on name patterns)
    const { data: districts } = await supabase
      .from('districts')
      .select('id, name, district_type')
      .eq('state_id', 'CA');

    let elementaryDistricts = 0;
    let unifiedDistricts = 0;
    let highSchoolDistricts = 0;
    let otherDistricts = 0;

    districts?.forEach(d => {
      const nameLower = d.name.toLowerCase();
      if (nameLower.includes('unified')) {
        unifiedDistricts++;
      } else if (nameLower.includes('elementary') || nameLower.includes('elem')) {
        elementaryDistricts++;
      } else if (nameLower.includes('high') || nameLower.includes('union high')) {
        highSchoolDistricts++;
      } else {
        otherDistricts++;
      }
    });

    // 3. Get districts with schools
    const { data: schoolDistrictIds } = await supabase
      .from('schools')
      .select('district_id');

    const uniqueDistrictIds = [...new Set(schoolDistrictIds?.map(s => s.district_id) || [])];

    const { count: districtsWithSchools } = await supabase
      .from('districts')
      .select('id', { count: 'exact', head: true })
      .eq('state_id', 'CA')
      .in('id', uniqueDistrictIds);

    // 4. Get schools count by type
    const caDistrictIds = districts?.map(d => d.id) || [];

    const { data: schoolCounts } = await supabase
      .from('schools')
      .select('school_type')
      .in('district_id', caDistrictIds);

    const schoolsByType: { [key: string]: number } = {};
    schoolCounts?.forEach(s => {
      schoolsByType[s.school_type] = (schoolsByType[s.school_type] || 0) + 1;
    });

    // 5. Find districts without schools (potential gaps)
    const { data: districtsWithoutSchools } = await supabase
      .from('districts')
      .select('id, name')
      .eq('state_id', 'CA')
      .not('id', 'in', `(SELECT DISTINCT district_id FROM schools)`);

    // 6. Get sample of largest districts by enrollment
    const { data: largestDistricts } = await supabase
      .from('districts')
      .select('name, id')
      .eq('state_id', 'CA')
      .order('name')
      .limit(10);

    // Print report
    console.log('\n📊 CURRENT COVERAGE:');
    console.log(`   Total CA districts in DB: ${totalDistricts} / 977 expected (${((totalDistricts || 0) / 977 * 100).toFixed(1)}%)`);
    console.log(`   Districts with schools: ${districtsWithSchools || 0}`);
    console.log(`   Districts without schools: ${districtsWithoutSchools?.length || 0}`);

    console.log('\n📈 DISTRICT TYPES (based on name):');
    console.log(`   Elementary districts: ${elementaryDistricts}`);
    console.log(`   Unified districts: ${unifiedDistricts}`);
    console.log(`   High School districts: ${highSchoolDistricts}`);
    console.log(`   Other/Unclear: ${otherDistricts}`);

    console.log('\n🏫 SCHOOLS BY TYPE:');
    console.log(`   Elementary: ${schoolsByType['Elementary'] || 0}`);
    console.log(`   K-8: ${schoolsByType['K-8'] || 0}`);
    console.log(`   Middle: ${schoolsByType['Middle'] || 0}`);
    console.log(`   High: ${schoolsByType['High'] || 0}`);
    console.log(`   K-12: ${schoolsByType['K-12'] || 0}`);
    console.log(`   Other: ${schoolsByType['Other'] || 0}`);
    console.log(`   Total schools: ${Object.values(schoolsByType).reduce((a, b) => a + b, 0)}`);

    // Coverage assessment
    console.log('\n🎯 COVERAGE ASSESSMENT:');
    const coverage = ((totalDistricts || 0) / 977) * 100;

    if (coverage >= 95) {
      console.log('   ✅ EXCELLENT: Nearly complete coverage of CA districts');
    } else if (coverage >= 80) {
      console.log('   ⚠️  GOOD: Most districts covered, but some gaps remain');
    } else if (coverage >= 50) {
      console.log('   ⚠️  PARTIAL: Significant gaps in district coverage');
    } else {
      console.log('   ❌ INCOMPLETE: Major gaps - comprehensive import needed');
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (totalDistricts! < 977) {
      console.log(`   1. Import ${977 - totalDistricts!} missing districts`);
      console.log('      Run: npm run import:ca-all');
    }

    if (districtsWithoutSchools && districtsWithoutSchools.length > 0) {
      console.log(`   2. Import schools for ${districtsWithoutSchools.length} districts without schools`);
      console.log('      These districts have no associated schools:');
      districtsWithoutSchools.slice(0, 5).forEach(d => {
        console.log(`      - ${d.name} (ID: ${d.id})`);
      });
      if (districtsWithoutSchools.length > 5) {
        console.log(`      ... and ${districtsWithoutSchools.length - 5} more`);
      }
    }

    // Check for key districts
    console.log('\n🔎 KEY DISTRICTS CHECK:');
    const keyDistrictNames = [
      'Los Angeles Unified',
      'San Diego Unified',
      'San Francisco Unified',
      'Long Beach Unified',
      'Fresno Unified',
      'Sacramento City Unified',
      'Oakland Unified',
      'San Jose Unified',
      'San Bernardino City Unified',
      'Elk Grove Unified'
    ];

    for (const districtName of keyDistrictNames) {
      const { data: found } = await supabase
        .from('districts')
        .select('id, name')
        .eq('state_id', 'CA')
        .ilike('name', `%${districtName}%`)
        .single();

      if (found) {
        const { count: schoolCount } = await supabase
          .from('schools')
          .select('*', { count: 'exact', head: true })
          .eq('district_id', found.id);

        console.log(`   ✅ ${districtName}: Found (${schoolCount} schools)`);
      } else {
        console.log(`   ❌ ${districtName}: MISSING`);
      }
    }

    // Data freshness check
    console.log('\n📅 DATA FRESHNESS:');
    const { data: recentDistricts } = await supabase
      .from('districts')
      .select('created_at')
      .eq('state_id', 'CA')
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentDistricts && recentDistricts[0]) {
      const lastImport = new Date(recentDistricts[0].created_at);
      const daysSinceImport = Math.floor((Date.now() - lastImport.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`   Last import: ${lastImport.toLocaleDateString()}`);
      console.log(`   Days since last import: ${daysSinceImport}`);

      if (daysSinceImport > 180) {
        console.log('   ⚠️  Data may be stale - consider refreshing');
      } else {
        console.log('   ✅ Data is reasonably fresh');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Validation complete!');

  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run validation
validateCaliforniaDistrictsCoverage()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });