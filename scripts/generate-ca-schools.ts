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

// Common elementary school name patterns in California
const ELEMENTARY_NAME_PATTERNS = [
  '[City] Elementary School',
  '[Name] Elementary School',
  '[Direction] [City] Elementary',
  '[Name] Primary School',
  '[City] Community School',
  '[Name] Academy',
  '[City] Magnet Elementary',
  '[Name] K-8 School',
  '[City] STEM Elementary',
  '[Name] Charter School',
  '[Name] Learning Center',
  '[City] Discovery Elementary'
];

const NAMES = [
  'Washington', 'Lincoln', 'Jefferson', 'Roosevelt', 'Kennedy',
  'Martin Luther King Jr.', 'Cesar Chavez', 'John Muir', 'Sierra',
  'Oak Grove', 'Willow Creek', 'Sunset', 'Sunrise', 'Mountain View',
  'Valley', 'Hillside', 'Riverside', 'Lakeside', 'Parkside',
  'Maple', 'Pine', 'Oak', 'Redwood', 'Sequoia', 'Mission',
  'Vista', 'Heritage', 'Liberty', 'Freedom', 'Independence',
  'Discovery', 'Innovation', 'Excellence', 'Achievement'
];

const DIRECTIONS = ['North', 'South', 'East', 'West', 'Central'];

/**
 * Generate a school ID (simulated NCES ID format)
 */
function generateSchoolId(districtId: string, index: number): string {
  // NCES format: district ID + 5-digit school code
  const schoolCode = String(10000 + index).padStart(5, '0');
  return `${districtId}${schoolCode}`;
}

/**
 * Generate school name based on district and pattern
 */
function generateSchoolName(districtName: string, patternIndex: number, nameIndex: number): string {
  const pattern = ELEMENTARY_NAME_PATTERNS[patternIndex % ELEMENTARY_NAME_PATTERNS.length];
  const name = NAMES[nameIndex % NAMES.length];
  const direction = DIRECTIONS[Math.floor(nameIndex / NAMES.length) % DIRECTIONS.length];

  // Extract city name from district name
  const cityMatch = districtName.match(/^(.+?)\s+(Unified|Elementary|Union|School|City)/);
  const city = cityMatch ? cityMatch[1] : districtName.split(' ')[0];

  return pattern
    .replace('[City]', city)
    .replace('[Name]', name)
    .replace('[Direction]', direction);
}

/**
 * Estimate number of elementary schools for a district
 */
function estimateSchoolCount(districtType: string, districtName: string): number {
  // Base estimates by district type
  const baseCount: { [key: string]: number } = {
    'Elementary': 3,  // Elementary districts typically have 2-5 schools
    'Unified': 8,     // Unified districts typically have 5-15 elementary schools
    'K-8': 2,         // K-8 districts typically have 1-3 schools
  };

  let count = baseCount[districtType] || 2;

  // Adjust based on district name patterns
  const nameLower = districtName.toLowerCase();
  if (nameLower.includes('los angeles')) count = 400; // LAUSD is huge
  else if (nameLower.includes('san diego')) count = 120;
  else if (nameLower.includes('san francisco')) count = 70;
  else if (nameLower.includes('oakland')) count = 50;
  else if (nameLower.includes('fresno')) count = 65;
  else if (nameLower.includes('sacramento')) count = 45;
  else if (nameLower.includes('long beach')) count = 55;
  else if (nameLower.includes('san jose')) count = 30;
  else if (nameLower.includes('city')) count = Math.floor(count * 1.5);
  else if (nameLower.includes('union')) count = Math.floor(count * 0.8);

  // Add some randomization
  const variance = Math.floor(count * 0.2);
  count = count + Math.floor(Math.random() * variance * 2) - variance;

  return Math.max(1, count);
}

/**
 * Main generation function
 */
async function generateCaliforniaSchools() {
  console.log('🚀 Starting California schools generation...\n');
  console.log('⚠️  Note: This generates placeholder schools for testing.');
  console.log('   For production, use actual CDE or NCES data.\n');

  try {
    // Get all CA districts from database that serve elementary grades
    console.log('📚 Fetching California districts from database...');
    const { data: districts, error: fetchError } = await supabase
      .from('districts')
      .select('id, name, district_type, city, county, zip')
      .eq('state_id', 'CA')
      .or('district_type.eq.Elementary,district_type.eq.Unified');

    if (fetchError) {
      throw fetchError;
    }

    if (!districts || districts.length === 0) {
      console.error('❌ No California districts found in database');
      process.exit(1);
    }

    console.log(`   Found ${districts.length} elementary-serving districts\n`);

    // Generate schools for each district
    const allSchools: any[] = [];
    let totalGenerated = 0;

    console.log('🏫 Generating schools for each district...\n');

    districts.forEach((district, districtIndex) => {
      const schoolCount = estimateSchoolCount(district.district_type, district.name);

      for (let i = 0; i < schoolCount; i++) {
        const schoolId = generateSchoolId(district.id, i);
        const schoolName = generateSchoolName(district.name, i, totalGenerated + i);

        // Determine school type (70% elementary, 30% K-8 for unified districts)
        let schoolType = 'Elementary';
        if (district.district_type === 'Unified' && Math.random() < 0.3) {
          schoolType = 'K-8';
        }

        const school = {
          id: schoolId,
          district_id: district.id,
          name: schoolName,
          school_type: schoolType,
          city: district.city,
          county: district.county,
          zip: district.zip,
          enrollment: Math.floor(Math.random() * 400) + 200, // 200-600 students
          grade_span_low: schoolType === 'K-8' ? 'K' : 'K',
          grade_span_high: schoolType === 'K-8' ? '8' : '5'
        };

        allSchools.push(school);
      }

      totalGenerated += schoolCount;

      // Show progress
      if ((districtIndex + 1) % 100 === 0 || districtIndex === districts.length - 1) {
        console.log(`  Progress: ${districtIndex + 1}/${districts.length} districts processed`);
      }
    });

    console.log(`\n📊 Generated ${allSchools.length} schools total\n`);

    // Show sample schools
    console.log('📝 Sample generated schools:');
    allSchools.slice(0, 10).forEach(school => {
      console.log(`   - ${school.name} (${school.school_type}) - District: ${school.district_id}`);
    });
    console.log();

    // Show statistics
    const stats = {
      elementary: allSchools.filter(s => s.school_type === 'Elementary').length,
      k8: allSchools.filter(s => s.school_type === 'K-8').length,
      totalEnrollment: allSchools.reduce((sum, s) => sum + s.enrollment, 0)
    };

    console.log('📈 School statistics:');
    console.log(`   Elementary schools: ${stats.elementary}`);
    console.log(`   K-8 schools: ${stats.k8}`);
    console.log(`   Average enrollment: ${Math.round(stats.totalEnrollment / allSchools.length)}`);
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
        if (successCount % 1000 === 0 || successCount === allSchools.length) {
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

    console.log(`\n📊 Database verification:`);
    console.log(`   Total CA elementary/K-8 schools in DB: ${totalCount}`);

    // District coverage
    const { data: districtCoverage } = await supabase
      .from('schools')
      .select('district_id')
      .eq('state_id', 'CA');

    const uniqueDistrictsWithSchools = new Set(districtCoverage?.map(s => s.district_id));
    console.log(`   Districts with schools: ${uniqueDistrictsWithSchools.size}/${districts.length}`);

  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

// Run the generation
generateCaliforniaSchools()
  .then(() => {
    console.log('\n✨ California schools generation completed!');
    console.log('\n⚠️  Remember: These are placeholder schools for testing.');
    console.log('   For production data, please obtain official school');
    console.log('   data from CDE or NCES.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });