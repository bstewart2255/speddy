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

// Configuration
const BATCH_SIZE = 100;
const API_DELAY = 200; // ms between API calls

/**
 * Pauses execution for specified milliseconds
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determines school type based on grade levels and name
 */
function determineSchoolType(
  lowestGrade: string | number | null,
  highestGrade: string | number | null,
  schoolName: string,
  schoolLevel?: string
): string {
  const nameLower = schoolName.toLowerCase();

  // Check name patterns first
  if (nameLower.includes('preschool') || nameLower.includes('pre-k')) return 'Preschool';
  if (nameLower.includes('elementary')) return 'Elementary';
  if (nameLower.includes('middle')) return 'Middle';
  if (nameLower.includes('high school') || nameLower.includes('high')) return 'High';
  if (nameLower.includes('continuation')) return 'Continuation';
  if (nameLower.includes('alternative')) return 'Alternative';
  if (nameLower.includes('k-8') || nameLower.includes('k8')) return 'K-8';

  // Use school level if provided
  if (schoolLevel) {
    const levelLower = schoolLevel.toLowerCase();
    if (levelLower === 'elementary') return 'Elementary';
    if (levelLower === 'middle') return 'Middle';
    if (levelLower === 'high') return 'High';
  }

  // Grade-based classification
  const gradeMap: { [key: string]: number } = {
    'K': 0, 'TK': -1, 'PK': -2, 'PS': -2, 'KG': 0,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    '11': 11, '12': 12, '13': 13, 'UG': 13
  };

  const lowStr = String(lowestGrade || '');
  const highStr = String(highestGrade || '');

  const low = gradeMap[lowStr] ?? (lowStr.match(/^\d+$/) ? parseInt(lowStr) : -3);
  const high = gradeMap[highStr] ?? (highStr.match(/^\d+$/) ? parseInt(highStr) : 13);

  // Elementary: PK-5 or K-5 or K-6
  if (low <= 0 && high >= 4 && high <= 6) return 'Elementary';

  // K-8: K through 8
  if (low <= 0 && high === 8) return 'K-8';

  // Middle: 6-8 or 7-8
  if (low >= 6 && low <= 7 && high === 8) return 'Middle';

  // High: 9-12
  if (low >= 9 && high >= 11) return 'High';

  // K-12: Full range
  if (low <= 0 && high >= 12) return 'K-12';

  // Default to Other
  return 'Other';
}

/**
 * Fetches schools for a specific district
 */
async function fetchSchoolsForDistrict(districtId: string): Promise<any[]> {
  try {
    const url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/2022/?leaid=${districtId}`;
    const response = await fetch(url);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`Error fetching schools for district ${districtId}:`, error);
    return [];
  }
}

/**
 * Main import function
 */
async function importCaliforniaElementarySchools() {
  console.log('🚀 Starting California elementary schools import...\n');

  try {
    // Get all CA districts from database that serve elementary grades
    console.log('📚 Fetching California districts from database...');
    const { data: districts, error: fetchError } = await supabase
      .from('districts')
      .select('id, name, district_type')
      .eq('state_id', 'CA')
      .in('district_type', ['Elementary', 'Unified', 'K-8']);

    if (fetchError) {
      throw fetchError;
    }

    if (!districts || districts.length === 0) {
      console.error('❌ No California districts found in database');
      console.log('   Please run the district import script first.');
      process.exit(1);
    }

    console.log(`   Found ${districts.length} elementary-serving districts\n`);

    // Process districts in batches
    const allSchools: any[] = [];
    let processedDistricts = 0;

    console.log('🏫 Fetching schools for each district...\n');

    for (const district of districts) {
      processedDistricts++;

      // Show progress
      if (processedDistricts % 50 === 0 || processedDistricts === districts.length) {
        console.log(`  Progress: ${processedDistricts}/${districts.length} districts processed`);
      }

      // Fetch schools for this district
      const schools = await fetchSchoolsForDistrict(district.id);

      // Process each school
      for (const school of schools) {
        // Determine school type
        const schoolType = determineSchoolType(
          school.lowest_grade_offered,
          school.highest_grade_offered,
          school.school_name || '',
          school.school_level
        );

        // Only include elementary and K-8 schools
        if (schoolType !== 'Elementary' && schoolType !== 'K-8') {
          continue;
        }

        // Create school object
        const schoolData = {
          id: school.ncessch || school.school_id,
          district_id: district.id,
          state_id: 'CA',
          name: school.school_name,
          school_type: schoolType,
          city: school.city_location || null,
          zip: school.zip_location || null,
          street: school.street_location || null,
          phone: school.phone || null,
          website: school.website || null,
          latitude: school.latitude || null,
          longitude: school.longitude || null,
          enrollment_total: school.enrollment || 0,
          charter: school.charter === 1 || school.charter === '1',
          magnet: school.magnet === 1 || school.magnet === '1',
          title_i: school.title_i_eligible === 1 || school.title_i_eligible === '1',
          is_active: school.school_status === 1 || school.operational_status === 1
        };

        allSchools.push(schoolData);
      }

      // Rate limiting
      await sleep(API_DELAY);
    }

    console.log(`\n📊 Found ${allSchools.length} elementary/K-8 schools total\n`);

    if (allSchools.length === 0) {
      console.log('⚠️  No elementary schools found. The API may have changed.');
      console.log('   Please check the API endpoints or use alternative data source.');
      process.exit(0);
    }

    // Show sample schools
    console.log('📝 Sample schools to import:');
    allSchools.slice(0, 5).forEach(school => {
      console.log(`   - ${school.name} (${school.school_type}) - ${school.city || 'N/A'}`);
    });
    console.log();

    // Import schools in batches
    console.log('💾 Importing schools to database...\n');
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < allSchools.length; i += BATCH_SIZE) {
      const batch = allSchools.slice(i, i + BATCH_SIZE);

      try {
        const { error } = await supabase
          .from('schools')
          .upsert(batch, { onConflict: 'id' });

        if (error) throw error;

        successCount += batch.length;
        if (successCount % 500 === 0 || successCount === allSchools.length) {
          console.log(`  Progress: ${successCount}/${allSchools.length} schools imported`);
        }
      } catch (error) {
        errorCount += batch.length;
        console.error(`  ❌ Error importing batch:`, error);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Schools imported: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Failed imports: ${errorCount}`);
    }

    // Verify in database
    const { count: totalCount } = await supabase
      .from('schools')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA')
      .in('school_type', ['Elementary', 'K-8']);

    const { data: sampleSchools } = await supabase
      .from('schools')
      .select('name, school_type, city, district_id')
      .eq('state_id', 'CA')
      .in('school_type', ['Elementary', 'K-8'])
      .limit(10)
      .order('name');

    console.log(`\n📊 Database verification:`);
    console.log(`   Total CA elementary/K-8 schools in DB: ${totalCount}`);

    if (sampleSchools) {
      console.log('\n   Sample of imported schools:');
      sampleSchools.forEach(s => {
        console.log(`   - ${s.name} (${s.school_type}) - ${s.city || 'N/A'}`);
      });
    }

    // District coverage report
    const { data: districtCoverage } = await supabase
      .from('schools')
      .select('district_id')
      .eq('state_id', 'CA')
      .in('school_type', ['Elementary', 'K-8']);

    const uniqueDistrictsWithSchools = new Set(districtCoverage?.map(s => s.district_id));
    console.log(`\n📊 District coverage:`);
    console.log(`   Districts with schools: ${uniqueDistrictsWithSchools.size}/${districts.length}`);

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importCaliforniaElementarySchools()
  .then(() => {
    console.log('\n✨ California elementary schools import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });