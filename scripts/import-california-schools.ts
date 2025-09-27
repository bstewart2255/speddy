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
const API_DELAY = 500; // ms between API calls to avoid rate limiting

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
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
  phone: string;
  website: string;
  enrollment: number;
  schools_count: number;
  urban_centric_locale: string;
}

interface NCESSchool {
  ncessch: string;
  school_name: string;
  leaid: string;
  school_type: string;
  lowest_grade_offered: string;
  highest_grade_offered: string;
  street_location: string;
  city_location: string;
  zip_location: string;
  phone: string;
  website: string;
  enrollment: number;
  teachers_fte: number;
  student_teacher_ratio: number;
  free_lunch_eligible: number;
  charter: string;
  magnet: string;
  title_i_eligible: string;
  latitude: number;
  longitude: number;
}

// Helper functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanPhoneNumber = (phone: string | null): string | null => {
  if (!phone) return null;
  // Remove non-numeric characters and format
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

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

// Fetch districts from Urban Institute API
async function fetchCaliforniaDistricts(): Promise<NCESDistrict[]> {
  console.log('📚 Fetching California districts from Urban Institute API...');

  const districts: NCESDistrict[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/?year=2022&fips=6&level=2&page=${page}&per_page=100`;
      console.log(`  Fetching page ${page}...`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        districts.push(...data.results);
        page++;
        await sleep(API_DELAY);
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching districts page ${page}:`, error);
      hasMore = false;
    }
  }

  console.log(`  ✅ Found ${districts.length} California districts`);
  return districts;
}

// Fetch schools for a specific district
async function fetchSchoolsForDistrict(districtId: string): Promise<NCESSchool[]> {
  const schools: NCESSchool[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/?year=2022&leaid=${districtId}&level=3&page=${page}&per_page=100`;

      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          // No schools found for this district
          return [];
        }
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
    } catch (error) {
      console.error(`Error fetching schools for district ${districtId}:`, error);
      hasMore = false;
    }
  }

  return schools;
}

// Transform and insert districts
async function insertDistricts(districts: NCESDistrict[]) {
  console.log('\n💾 Inserting districts into database...');

  let successCount = 0;
  let errorCount = 0;

  // Process in batches
  for (let i = 0; i < districts.length; i += BATCH_SIZE) {
    const batch = districts.slice(i, i + BATCH_SIZE);

    const transformedBatch = batch.map(d => ({
      id: d.leaid,
      state_id: 'CA',
      name: d.lea_name,
      city: d.city_location,
      zip: d.zip_location,
      county: d.county_name,
      phone: cleanPhoneNumber(d.phone),
      website: d.website,
      enrollment_total: d.enrollment || 0,
      schools_count: d.schools_count || 0,
      urban_centric_locale: d.urban_centric_locale,
      is_active: true
    }));

    try {
      const { error } = await supabase
        .from('districts')
        .upsert(transformedBatch, { onConflict: 'id' });

      if (error) throw error;

      successCount += batch.length;
      console.log(`  Progress: ${successCount}/${districts.length} districts inserted`);
    } catch (error) {
      errorCount += batch.length;
      console.error(`  ❌ Error inserting batch:`, error);
    }
  }

  console.log(`\n✅ Districts import complete: ${successCount} success, ${errorCount} errors`);
  return successCount;
}

// Transform and insert schools
async function insertSchools(schools: NCESSchool[], districtName: string) {
  if (schools.length === 0) return 0;

  let successCount = 0;
  let errorCount = 0;

  // Filter for elementary schools only
  const elementarySchools = schools.filter(s => {
    const schoolType = determineSchoolType(s.lowest_grade_offered, s.highest_grade_offered);
    return schoolType === 'Elementary' || schoolType === 'K-8';
  });

  if (elementarySchools.length === 0) return 0;

  // Process in batches
  for (let i = 0; i < elementarySchools.length; i += BATCH_SIZE) {
    const batch = elementarySchools.slice(i, i + BATCH_SIZE);

    const transformedBatch = batch.map(s => ({
      id: s.ncessch,
      district_id: s.leaid,
      state_id: 'CA',
      name: s.school_name,
      school_type: determineSchoolType(s.lowest_grade_offered, s.highest_grade_offered),
      grade_span_low: s.lowest_grade_offered,
      grade_span_high: s.highest_grade_offered,
      street_address: s.street_location,
      city: s.city_location,
      zip: s.zip_location,
      phone: cleanPhoneNumber(s.phone),
      website: s.website,
      enrollment_total: s.enrollment || 0,
      teachers_fte: s.teachers_fte || 0,
      student_teacher_ratio: s.student_teacher_ratio || 0,
      free_reduced_lunch_eligible: s.free_lunch_eligible || 0,
      charter_school: s.charter === '1',
      magnet_school: s.magnet === '1',
      title_i_school: s.title_i_eligible === '1',
      latitude: s.latitude || null,
      longitude: s.longitude || null,
      is_active: true
    }));

    try {
      const { error } = await supabase
        .from('schools')
        .upsert(transformedBatch, { onConflict: 'id' });

      if (error) throw error;

      successCount += batch.length;
    } catch (error) {
      errorCount += batch.length;
      console.error(`    ❌ Error inserting school batch:`, error);
    }
  }

  return successCount;
}

// Main import function
async function importCaliforniaSchools() {
  console.log('🚀 Starting California schools import...\n');

  try {
    // Step 1: Fetch all California districts
    const districts = await fetchCaliforniaDistricts();

    if (districts.length === 0) {
      console.error('❌ No districts found');
      return;
    }

    // Step 2: Insert districts
    await insertDistricts(districts);

    // Step 3: Fetch and insert schools for each district
    console.log('\n🏫 Fetching and inserting elementary schools...');

    let totalSchools = 0;
    let processedDistricts = 0;

    for (const district of districts) {
      processedDistricts++;

      if (processedDistricts % 10 === 0) {
        console.log(`\n📊 Progress: ${processedDistricts}/${districts.length} districts processed`);
      }

      try {
        const schools = await fetchSchoolsForDistrict(district.leaid);

        if (schools.length > 0) {
          const insertedCount = await insertSchools(schools, district.lea_name);
          totalSchools += insertedCount;

          if (insertedCount > 0) {
            console.log(`  ✓ ${district.lea_name}: ${insertedCount} elementary schools`);
          }
        }

        // Rate limiting
        await sleep(API_DELAY);
      } catch (error) {
        console.error(`  ❌ Error processing district ${district.lea_name}:`, error);
      }
    }

    // Step 4: Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Districts imported: ${districts.length}`);
    console.log(`✅ Elementary schools imported: ${totalSchools}`);

    // Verify in database
    const { count: districtCount } = await supabase
      .from('districts')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA');

    const { count: schoolCount } = await supabase
      .from('schools')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA')
      .in('school_type', ['Elementary', 'K-8']);

    console.log(`\n📊 Database verification:`);
    console.log(`   Total CA districts in DB: ${districtCount}`);
    console.log(`   Total CA elementary schools in DB: ${schoolCount}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the import
importCaliforniaSchools()
  .then(() => {
    console.log('\n✨ California schools import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Import failed:', error);
    process.exit(1);
  });