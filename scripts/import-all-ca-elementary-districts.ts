#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BATCH_SIZE = 50;
const API_DELAY = 300; // Reduced delay for faster import

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

// Types
interface NCESDistrict {
  leaid: string;
  lea_name: string;
  city_location: string;
  county_name: string;
  zip_location: string;
  phone?: string;
  website?: string;
  enrollment?: number;
  schools_count?: number;
  urban_centric_locale?: string;
  lea_type?: string; // District type indicator
}

interface NCESSchool {
  ncessch: string;
  school_name: string;
  leaid: string;
  school_type?: string;
  lowest_grade_offered: string;
  highest_grade_offered: string;
  city_location: string;
  zip_location: string;
  phone?: string;
  enrollment?: number;
}

// Helper functions
/**
 * Pauses execution for specified milliseconds
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determines if a district serves elementary grades based on its schools
 */
const servesElementaryGrades = (lowestGrade: string, highestGrade: string): boolean => {
  const elementaryGrades = ['PK', 'K', '1', '2', '3', '4', '5'];
  return elementaryGrades.includes(lowestGrade) ||
         elementaryGrades.includes(highestGrade) ||
         (lowestGrade === 'K' && ['6', '7', '8', '12'].includes(highestGrade));
};

/**
 * Determines school type based on grade range
 */
const determineSchoolType = (lowestGrade: string, highestGrade: string): string => {
  const gradeMap: { [key: string]: number } = {
    'PK': -1, 'K': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, '11': 11, '12': 12
  };

  const low = gradeMap[lowestGrade] ?? 0;
  const high = gradeMap[highestGrade] ?? 12;

  if (high <= 5) return 'Elementary';
  if (low >= 6 && high <= 8) return 'Middle';
  if (low >= 9) return 'High';
  if (low <= 5 && high >= 9) return 'K-12';
  if (low <= 5 && high <= 8) return 'K-8';
  return 'Other';
};

/**
 * Determines district type based on name and grade levels served
 */
const determineDistrictType = (name: string, hasElementary: boolean): string => {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('unified')) return 'Unified';
  if (nameLower.includes('union high')) return 'High';
  if (nameLower.includes('high school')) return 'High';
  if (nameLower.includes('elementary')) return 'Elementary';
  if (nameLower.includes('elem')) return 'Elementary';

  // If name doesn't give clear indication, use grade levels
  if (hasElementary) return 'Elementary';

  return 'Other';
};

/**
 * Fetches ALL California districts from the Urban Institute API
 */
async function fetchAllCaliforniaDistricts(): Promise<NCESDistrict[]> {
  console.log('📚 Fetching ALL California districts from Urban Institute API...');
  console.log('   This will fetch all 977 districts, including Elementary, Unified, and High School districts\n');

  const districts: NCESDistrict[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/2022/?fips=6&level=lea&page=${page}&per_page=100`;

      if (page % 5 === 1) {
        console.log(`  Fetching pages ${page}-${page + 4}...`);
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        districts.push(...data.results);
        page++;

        // Rate limiting
        if (page % 3 === 0) {
          await sleep(API_DELAY);
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching districts page ${page}:`, error);
      hasMore = false;
    }
  }

  console.log(`\n  ✅ Found ${districts.length} total California districts`);
  return districts;
}

/**
 * Fetches sample schools for a district to determine what grades it serves
 */
async function fetchSampleSchoolsForDistrict(districtId: string): Promise<NCESSchool[]> {
  try {
    const url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/2022/?leaid=${districtId}&page=1&per_page=10`;

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`Error fetching schools for district ${districtId}:`, error);
    return [];
  }
}

/**
 * Main import function - imports ALL CA districts and their elementary schools
 */
async function importAllCaliforniaElementaryDistricts() {
  console.log('🚀 Starting comprehensive California districts import...\n');
  console.log('📋 This script will:');
  console.log('   1. Import ALL 977 California school districts');
  console.log('   2. Identify which districts serve elementary grades');
  console.log('   3. Import elementary/K-8 schools for those districts\n');

  try {
    // Step 1: Fetch ALL California districts
    const allDistricts = await fetchAllCaliforniaDistricts();

    if (allDistricts.length === 0) {
      console.error('❌ No districts found');
      return;
    }

    // Step 2: Process and categorize districts
    console.log('\n🔍 Analyzing districts to identify those serving elementary grades...');

    const districtsWithElementary: NCESDistrict[] = [];
    const highSchoolOnlyDistricts: NCESDistrict[] = [];
    let processedCount = 0;

    // Insert ALL districts first
    console.log('\n💾 Inserting all districts into database...');

    for (let i = 0; i < allDistricts.length; i += BATCH_SIZE) {
      const batch = allDistricts.slice(i, i + BATCH_SIZE);

      const transformedBatch = batch.map(d => ({
        id: d.leaid,
        state_id: 'CA',
        name: d.lea_name,
        city: d.city_location,
        zip: d.zip_location,
        county: d.county_name,
        phone: d.phone || null,
        website: d.website || null,
        district_type: null // We'll update this later
      }));

      try {
        const { error } = await supabase
          .from('districts')
          .upsert(transformedBatch, { onConflict: 'id' });

        if (error) throw error;

        processedCount += batch.length;
        if (processedCount % 100 === 0) {
          console.log(`  Progress: ${processedCount}/${allDistricts.length} districts inserted`);
        }
      } catch (error) {
        console.error(`  ❌ Error inserting batch:`, error);
      }
    }

    console.log(`\n✅ All ${processedCount} districts inserted`);

    // Step 3: Identify districts that serve elementary grades
    console.log('\n🏫 Checking which districts have elementary/K-8 schools...');

    let checkedCount = 0;
    const districtsToImportSchools: NCESDistrict[] = [];

    for (const district of allDistricts) {
      checkedCount++;

      if (checkedCount % 50 === 0) {
        console.log(`  Checked ${checkedCount}/${allDistricts.length} districts...`);
        await sleep(API_DELAY);
      }

      // Check district name first
      const nameIndicatesElementary = district.lea_name.toLowerCase().includes('elementary') ||
                                      district.lea_name.toLowerCase().includes('elem') ||
                                      district.lea_name.toLowerCase().includes('unified');

      if (nameIndicatesElementary) {
        districtsToImportSchools.push(district);
      } else if (!district.lea_name.toLowerCase().includes('high')) {
        // For unclear cases, sample schools to check grades
        const sampleSchools = await fetchSampleSchoolsForDistrict(district.leaid);

        if (sampleSchools.some(s => servesElementaryGrades(s.lowest_grade_offered, s.highest_grade_offered))) {
          districtsToImportSchools.push(district);
        }
      }
    }

    console.log(`\n✅ Found ${districtsToImportSchools.length} districts that serve elementary grades`);

    // Step 4: Import elementary schools for relevant districts
    console.log('\n🏫 Importing elementary/K-8 schools for relevant districts...');

    let totalSchoolsImported = 0;
    let districtIndex = 0;

    for (const district of districtsToImportSchools) {
      districtIndex++;

      if (districtIndex % 10 === 0) {
        console.log(`\n📊 Progress: ${districtIndex}/${districtsToImportSchools.length} districts processed`);
        console.log(`   Total schools imported so far: ${totalSchoolsImported}`);
      }

      try {
        // Fetch all schools for this district
        const schools: NCESSchool[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/?year=2022&leaid=${district.leaid}&level=3&page=${page}&per_page=100`;

          const response = await fetch(url);
          if (!response.ok) {
            if (response.status === 404) break;
            throw new Error(`API error: ${response.status}`);
          }

          const data = await response.json();
          if (data.results && data.results.length > 0) {
            schools.push(...data.results);
            page++;
            await sleep(API_DELAY);
          } else {
            hasMore = false;
          }
        }

        // Filter for elementary/K-8 schools
        const elementarySchools = schools.filter(s => {
          const type = determineSchoolType(s.lowest_grade_offered, s.highest_grade_offered);
          return type === 'Elementary' || type === 'K-8';
        });

        if (elementarySchools.length > 0) {
          // Insert schools in batches
          for (let i = 0; i < elementarySchools.length; i += BATCH_SIZE) {
            const batch = elementarySchools.slice(i, i + BATCH_SIZE);

            const transformedBatch = batch.map(s => ({
              id: s.ncessch,
              district_id: district.leaid,
              name: s.school_name,
              school_type: determineSchoolType(s.lowest_grade_offered, s.highest_grade_offered),
              grade_span_low: s.lowest_grade_offered,
              grade_span_high: s.highest_grade_offered,
              city: s.city_location,
              zip: s.zip_location,
              phone: s.phone || null,
              enrollment: s.enrollment || null
            }));

            const { error } = await supabase
              .from('schools')
              .upsert(transformedBatch, { onConflict: 'id' });

            if (error) {
              console.error(`  ❌ Error inserting schools for ${district.lea_name}:`, error);
            } else {
              totalSchoolsImported += batch.length;
            }
          }
        }
      } catch (error) {
        console.error(`  ❌ Error processing district ${district.lea_name}:`, error);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT COMPLETE - SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Total districts imported: ${processedCount}`);
    console.log(`✅ Districts with elementary grades: ${districtsToImportSchools.length}`);
    console.log(`✅ Elementary/K-8 schools imported: ${totalSchoolsImported}`);

    // Verify in database
    const { count: districtCount } = await supabase
      .from('districts')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA');

    const { count: schoolCount } = await supabase
      .from('schools')
      .select('*', { count: 'exact', head: true })
      .in('school_type', ['Elementary', 'K-8']);

    console.log(`\n📊 Database verification:`);
    console.log(`   Total CA districts in DB: ${districtCount}`);
    console.log(`   Total elementary/K-8 schools in DB: ${schoolCount}`);

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importAllCaliforniaElementaryDistricts()
  .then(() => {
    console.log('\n✨ Comprehensive California import completed successfully!');
    console.log('   All districts serving elementary students are now in the database.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Import failed:', error);
    process.exit(1);
  });