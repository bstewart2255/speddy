#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Configuration - SMALL TEST BATCH
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_DISTRICTS = 3; // Only process 3 districts for testing
const API_DELAY = 500;

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
 * Pauses execution for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after delay
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Test function to import a small batch of California districts and schools
 * Used for validating the import process before running full import
 * Imports only 3 districts and their elementary schools
 * @returns {Promise<void>} Resolves when test import is complete
 */
async function testCaliforniaImport() {
  console.log('🧪 TEST MODE: Importing only 3 California districts and their elementary schools\n');

  try {
    // Fetch a small batch of districts
    console.log('📚 Fetching test batch of California districts...');
    const url = `https://educationdata.urban.org/api/v1/schools/ccd/lea/directory/2022/?fips=6&page=1&per_page=${MAX_DISTRICTS}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const districts = data.results || [];

    console.log(`  Found ${districts.length} districts for testing\n`);

    // Display what we're about to import
    console.log('Districts to import:');
    districts.forEach((d: any) => {
      console.log(`  - ${d.lea_name} (${d.city_location}, ${d.county_name})`);
    });

    // Insert districts
    console.log('\n💾 Inserting test districts...');
    for (const district of districts) {
      const districtData = {
        id: district.leaid,
        state_id: 'CA',
        name: district.lea_name,
        city: district.city_location,
        zip: district.zip_location,
        county: district.county_name,
        enrollment_total: district.enrollment || 0,
        is_active: true
      };

      const { error } = await supabase
        .from('districts')
        .upsert(districtData, { onConflict: 'id' });

      if (error) {
        console.error(`  ❌ Error inserting ${district.lea_name}:`, error);
      } else {
        console.log(`  ✅ Inserted: ${district.lea_name}`);
      }
    }

    // Fetch and insert schools for first district only
    if (districts.length > 0) {
      const testDistrict = districts[0];
      console.log(`\n🏫 Fetching schools for test district: ${testDistrict.lea_name}...`);

      await sleep(API_DELAY);

      const schoolsUrl = `https://educationdata.urban.org/api/v1/schools/ccd/directory/2022/?leaid=${testDistrict.leaid}&page=1&per_page=10`;
      const schoolsResponse = await fetch(schoolsUrl);

      if (schoolsResponse.ok) {
        const schoolsData = await schoolsResponse.json();
        const schools = schoolsData.results || [];

        console.log(`  Found ${schools.length} schools`);

        // Insert first few elementary schools
        let elementaryCount = 0;
        for (const school of schools) {
          // Simple elementary check
          if (school.lowest_grade_offered &&
              (school.lowest_grade_offered === 'K' ||
               school.lowest_grade_offered === 'PK' ||
               school.lowest_grade_offered === '1')) {

            const schoolData = {
              id: school.ncessch,
              district_id: school.leaid,
              state_id: 'CA',
              name: school.school_name,
              school_type: 'Elementary',
              city: school.city_location,
              zip: school.zip_location,
              enrollment_total: school.enrollment || 0,
              latitude: school.latitude || null,
              longitude: school.longitude || null,
              is_active: true
            };

            const { error } = await supabase
              .from('schools')
              .upsert(schoolData, { onConflict: 'id' });

            if (!error) {
              elementaryCount++;
              console.log(`    ✅ Inserted elementary school: ${school.school_name}`);
            }

            if (elementaryCount >= 3) break; // Limit to 3 schools for test
          }
        }

        console.log(`  Total elementary schools inserted: ${elementaryCount}`);
      }
    }

    // Verify results
    console.log('\n📊 Test import verification:');

    const { count: districtCount } = await supabase
      .from('districts')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA');

    const { count: schoolCount } = await supabase
      .from('schools')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA');

    console.log(`  Total CA districts in database: ${districtCount}`);
    console.log(`  Total CA schools in database: ${schoolCount}`);

    console.log('\n✅ Test import completed successfully!');
    console.log('\nIf everything looks good, run the full import with:');
    console.log('  npx tsx scripts/import-california-schools.ts');

  } catch (error) {
    console.error('❌ Test import failed:', error);
    process.exit(1);
  }
}

// Run the test
testCaliforniaImport();