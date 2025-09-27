#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';

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
const EXCEL_FILE_PATH = join(__dirname, '..', 'attached_assets', 'fiscalyear2024to25_1758996157561.xlsx');
const BATCH_SIZE = 50;

/**
 * Reads and analyzes the Excel file structure
 */
function analyzeExcelFile(filePath: string) {
  console.log('📊 Reading Excel file...');

  // Read the file
  const workbook = XLSX.readFile(filePath);

  // Get sheet names
  const sheetNames = workbook.SheetNames;
  console.log(`\n📋 Found ${sheetNames.length} sheet(s):`);
  sheetNames.forEach(name => console.log(`   - ${name}`));

  // Look for the "List of Districts" sheet or use the second sheet
  const targetSheetName = sheetNames.find(name => name.includes('List of Districts')) || sheetNames[1];
  const targetSheet = workbook.Sheets[targetSheetName];

  // Read with header option to skip the first few rows
  // Use range to skip header rows and start from actual data
  const rawData = XLSX.utils.sheet_to_json(targetSheet, { header: 1 }) as any[][];

  // Based on analysis, we know headers are at row 5 and data starts at row 6
  const headerRowIndex = 5;
  const headers = ['CDS Code', 'County', 'District', 'Type', 'Component'];

  console.log('\n🔍 Using known Excel structure');
  console.log('   Headers:', headers.join(', '));

  // Extract data starting from row 6
  let data: any[] = [];
  for (let i = 6; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // Check if this is a valid district row (has a 14-digit CDS code)
    const cdsCode = row[0];
    if (!cdsCode || !String(cdsCode).match(/^\d{14}$/)) continue;

    const obj: any = {
      'CDS Code': String(row[0]).trim(),
      'County': row[1] ? String(row[1]).trim() : '',
      'District': row[2] ? String(row[2]).trim() : '',
      'Type': row[3] ? String(row[3]).trim() : '',
      'Component': row[4] ? String(row[4]).trim() : ''
    };

    data.push(obj);
  }

  console.log(`\n📈 Sheet "${targetSheetName}" contains ${data.length} rows`);

  if (data.length > 0) {
    console.log('\n🔍 Column headers found:');
    const headers = Object.keys(data[0]);
    headers.forEach(header => {
      const sampleValue = (data[0] as any)[header];
      console.log(`   - ${header}: ${typeof sampleValue} (sample: "${String(sampleValue).substring(0, 50)}${String(sampleValue).length > 50 ? '...' : ''}")`);
    });

    // Show first few rows as sample
    console.log('\n📝 Sample data (first 3 rows):');
    data.slice(0, 3).forEach((row, index) => {
      console.log(`\nRow ${index + 1}:`);
      Object.entries(row).forEach(([key, value]) => {
        console.log(`   ${key}: ${String(value).substring(0, 100)}`);
      });
    });
  }

  return { workbook, data, sheetNames };
}

/**
 * Determines district type based on name
 */
function determineDistrictType(name: string): string {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('unified')) return 'Unified';
  if (nameLower.includes('union high')) return 'High';
  if (nameLower.includes('high school')) return 'High';
  if (nameLower.includes('elementary')) return 'Elementary';
  if (nameLower.includes('elem')) return 'Elementary';
  if (nameLower.includes('community college')) return 'Community College';

  return 'Other';
}

/**
 * Imports California districts from Excel file
 */
async function importCaliforniaDistrictsFromExcel() {
  console.log('🚀 Starting California districts import from Excel file...\n');

  try {
    // Check if file exists
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      console.error(`❌ Excel file not found at: ${EXCEL_FILE_PATH}`);
      process.exit(1);
    }

    // Analyze the file
    const { data } = analyzeExcelFile(EXCEL_FILE_PATH);

    // Prompt to continue
    console.log('\n' + '='.repeat(60));
    console.log('📋 Ready to import districts');
    console.log('='.repeat(60));

    // Process districts
    let successCount = 0;
    let errorCount = 0;
    const districts: any[] = [];

    // Map Excel columns to database fields
    for (const row of data) {
      const rowData = row as any;

      const cdsCode = rowData['CDS Code'];
      const districtName = rowData['District'];
      const county = rowData['County'];
      const districtType = rowData['Type'];

      // Skip if no CDS code or name
      if (!cdsCode || !districtName) {
        console.log(`⚠️  Skipping row - missing CDS code or name`);
        continue;
      }

      // Extract district code from CDS code (first 7 digits)
      // CDS format: CC DDDDD SSSSSSS (County, District, School)
      const districtId = String(cdsCode).substring(0, 7);

      // Create district object
      const district = {
        id: districtId,
        state_id: 'CA',
        name: districtName.trim(),
        district_type: districtType ? districtType.trim() : determineDistrictType(districtName),
        city: null, // Not in this dataset
        county: county ? county.trim() : null,
        zip: null, // Not in this dataset
        phone: null,
        website: null
      };

      districts.push(district);
    }

    console.log(`\n📊 Found ${districts.length} districts to import`);

    // Show district type breakdown
    const typeBreakdown: { [key: string]: number } = {};
    districts.forEach(d => {
      typeBreakdown[d.district_type] = (typeBreakdown[d.district_type] || 0) + 1;
    });

    console.log('\n📈 District types:');
    Object.entries(typeBreakdown).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Import in batches
    console.log('\n💾 Importing districts to database...\n');

    for (let i = 0; i < districts.length; i += BATCH_SIZE) {
      const batch = districts.slice(i, i + BATCH_SIZE);

      try {
        const { error } = await supabase
          .from('districts')
          .upsert(batch, { onConflict: 'id' });

        if (error) throw error;

        successCount += batch.length;
        console.log(`  Progress: ${successCount}/${districts.length} districts imported`);
      } catch (error) {
        errorCount += batch.length;
        console.error(`  ❌ Error importing batch:`, error);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Districts imported: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Failed imports: ${errorCount}`);
    }

    // Verify in database
    const { count: totalCount } = await supabase
      .from('districts')
      .select('*', { count: 'exact', head: true })
      .eq('state_id', 'CA');

    const { data: sampleDistricts } = await supabase
      .from('districts')
      .select('name, district_type, city')
      .eq('state_id', 'CA')
      .limit(10)
      .order('name');

    console.log(`\n📊 Database verification:`);
    console.log(`   Total CA districts in DB: ${totalCount}`);

    if (sampleDistricts) {
      console.log('\n   Sample of imported districts:');
      sampleDistricts.forEach(d => {
        console.log(`   - ${d.name} (${d.district_type}) - ${d.city}`);
      });
    }

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importCaliforniaDistrictsFromExcel()
  .then(() => {
    console.log('\n✨ California districts import from Excel completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });