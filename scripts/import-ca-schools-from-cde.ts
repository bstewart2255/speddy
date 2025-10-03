#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';
import * as https from 'https';

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
const CDE_SCHOOLS_URL = 'https://www.cde.ca.gov/schooldirectory/report?rid=dl1&tp=txt';
const TEMP_FILE = join(__dirname, '..', 'temp', 'ca_schools.txt');
const BATCH_SIZE = 100;

/**
 * Downloads file from URL
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log('   Following redirect to:', redirectUrl);
          https.get(redirectUrl, (redirectResponse) => {
            redirectResponse.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', reject);
        }
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', reject);
  });
}

/**
 * Determines school type based on grade levels
 */
function determineSchoolType(
  lowestGrade: string | null,
  highestGrade: string | null,
  schoolName: string
): string {
  const nameLower = schoolName.toLowerCase();

  // Check name patterns first
  if (nameLower.includes('preschool') || nameLower.includes('pre-k')) return 'Preschool';
  if (nameLower.includes('elementary')) return 'Elementary';
  if (nameLower.includes('middle')) return 'Middle';
  if (nameLower.includes('high school') || nameLower.includes('high')) return 'High';
  if (nameLower.includes('continuation')) return 'Continuation';
  if (nameLower.includes('alternative')) return 'Alternative';
  if (nameLower.includes('adult')) return 'Adult';
  if (nameLower.includes('charter')) {
    // Charter schools need grade-based classification
    if (!lowestGrade || !highestGrade) return 'Charter';
  }

  // Grade-based classification
  if (!lowestGrade || !highestGrade) return 'Other';

  const gradeMap: { [key: string]: number } = {
    'K': 0, 'TK': -1, 'PK': -2, 'PS': -2,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    '11': 11, '12': 12, '13': 13, 'UG': 13
  };

  const low = gradeMap[lowestGrade] ?? -3;
  const high = gradeMap[highestGrade] ?? 13;

  // Elementary: PK-5 or K-5 or K-6
  if (low <= 0 && high <= 6) return 'Elementary';

  // K-8: K through 8
  if (low <= 0 && high === 8) return 'K-8';

  // Middle: 6-8 or 7-8
  if (low >= 6 && high <= 8) return 'Middle';

  // High: 9-12
  if (low >= 9 && high === 12) return 'High';

  // K-12: Full range
  if (low <= 0 && high >= 12) return 'K-12';

  // Mixed/Other
  return 'Other';
}

/**
 * Parse tab-delimited file
 */
function parseTabDelimitedFile(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return [];

  // First line is headers
  const headers = lines[0].split('\t').map(h => h.trim());
  console.log('📋 Found headers:', headers.slice(0, 10).join(', '), '...');

  // Parse data rows
  const data: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });

    data.push(row);
  }

  return data;
}

/**
 * Main import function
 */
async function importCaliforniaSchoolsFromCDE() {
  console.log('🚀 Starting California schools import from CDE data...\n');

  try {
    // Create temp directory if it doesn't exist
    const tempDir = join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Try downloading from CDE
    console.log('📥 Attempting to download schools data from CDE...');
    console.log('   Note: CDE website may require manual download.');
    console.log('   If automatic download fails, please:');
    console.log('   1. Visit: https://www.cde.ca.gov/ds/si/ds/pubschls.asp');
    console.log('   2. Download the "Public Schools" text file');
    console.log('   3. Save it as: temp/ca_schools.txt\n');

    // Check if file already exists
    if (fs.existsSync(TEMP_FILE)) {
      console.log('✅ Found existing schools file, using that...\n');
    } else {
      console.log('❌ Schools file not found. Please download manually from:');
      console.log('   https://www.cde.ca.gov/ds/si/ds/pubschls.asp');
      console.log('   Save as: temp/ca_schools.txt');
      process.exit(1);
    }

    // Parse the file
    console.log('📊 Parsing schools data...');
    const schools = parseTabDelimitedFile(TEMP_FILE);
    console.log(`   Found ${schools.length} total schools\n`);

    // Get all CA districts from our database
    console.log('📚 Fetching California districts from database...');
    const { data: districts, error: fetchError } = await supabase
      .from('districts')
      .select('id')
      .eq('state_id', 'CA');

    if (fetchError) {
      throw fetchError;
    }

    const districtIds = new Set(districts?.map(d => d.id) || []);
    console.log(`   Found ${districtIds.size} CA districts in database\n`);

    // Filter and prepare elementary schools
    console.log('🔍 Filtering elementary and K-8 schools...');
    interface SchoolData {
      id: string;
      district_id: string;
      state_id: string;
      name: string;
      school_type: string;
      city: string | null;
      zip: string | null;
      street: string | null;
      phone: string | null;
      website: string | null;
      latitude: number | null;
      longitude: number | null;
      charter: boolean;
      magnet: boolean;
      is_active: boolean;
    }
    const elementarySchools: SchoolData[] = [];
    let skippedCount = 0;
    let noDistrictCount = 0;

    for (const school of schools) {
      // Get CDS code
      const cdsCode = school['CDSCode'] || school['CDS Code'] || school['CDS_CODE'];
      if (!cdsCode || cdsCode.length !== 14) {
        skippedCount++;
        continue;
      }

      // Extract district ID from CDS code (first 7 digits)
      const districtId = cdsCode.substring(0, 7);

      // Check if district exists in our database
      if (!districtIds.has(districtId)) {
        noDistrictCount++;
        continue;
      }

      // Get school info
      const schoolName = school['School'] || school['SchoolName'] || school['School Name'] || '';
      const statusType = school['StatusType'] || school['Status Type'] || '';
      const schoolType = school['SchoolType'] || school['School Type'] || '';
      const lowestGrade = school['LowGrade'] || school['Low Grade'] || school['Lowest Grade'] || null;
      const highestGrade = school['HighGrade'] || school['High Grade'] || school['Highest Grade'] || null;

      // Skip closed schools
      if (statusType.toLowerCase() === 'closed' || statusType.toLowerCase() === 'inactive') {
        skippedCount++;
        continue;
      }

      // Determine school type
      const determinedType = determineSchoolType(lowestGrade, highestGrade, schoolName);

      // Only include elementary and K-8 schools
      if (determinedType !== 'Elementary' && determinedType !== 'K-8') {
        continue;
      }

      // Create school object
      const schoolData = {
        id: cdsCode,
        district_id: districtId,
        state_id: 'CA',
        name: schoolName,
        school_type: determinedType,
        city: school['City'] || null,
        zip: school['Zip'] || null,
        street: school['Street'] || school['StreetAbr'] || null,
        phone: school['Phone'] || null,
        website: school['Website'] || null,
        latitude: school['Latitude'] ? parseFloat(school['Latitude']) : null,
        longitude: school['Longitude'] ? parseFloat(school['Longitude']) : null,
        charter: schoolType.toLowerCase().includes('charter'),
        magnet: school['Magnet'] === 'Y' || schoolType.toLowerCase().includes('magnet'),
        is_active: true
      };

      elementarySchools.push(schoolData);
    }

    console.log(`   Found ${elementarySchools.length} elementary/K-8 schools`);
    console.log(`   Skipped ${skippedCount} invalid/closed schools`);
    console.log(`   Skipped ${noDistrictCount} schools with no matching district\n`);

    // Show sample data
    if (elementarySchools.length > 0) {
      console.log('📝 Sample schools to import:');
      elementarySchools.slice(0, 5).forEach(school => {
        console.log(`   - ${school.name} (${school.school_type}) - District: ${school.district_id}`);
      });
      console.log();
    }

    // Import in batches
    console.log('💾 Importing schools to database...\n');
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < elementarySchools.length; i += BATCH_SIZE) {
      const batch = elementarySchools.slice(i, i + BATCH_SIZE);

      try {
        const { error } = await supabase
          .from('schools')
          .upsert(batch, { onConflict: 'id' });

        if (error) throw error;

        successCount += batch.length;
        if (successCount % 500 === 0 || successCount === elementarySchools.length) {
          console.log(`  Progress: ${successCount}/${elementarySchools.length} schools imported`);
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

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importCaliforniaSchoolsFromCDE()
  .then(() => {
    console.log('\n✨ California schools import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });