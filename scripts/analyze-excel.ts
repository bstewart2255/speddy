#!/usr/bin/env node

import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXCEL_FILE_PATH = join(__dirname, '..', 'attached_assets', 'fiscalyear2024to25_1758996157561.xlsx');

// Read the Excel file
const workbook = XLSX.readFile(EXCEL_FILE_PATH);

console.log('📋 Sheets in workbook:');
workbook.SheetNames.forEach(name => console.log(`  - ${name}`));

// Check the second sheet "List of Districts"
const sheet = workbook.Sheets['List of Districts'];
const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

console.log('\n📊 First 10 rows of "List of Districts" sheet:');
console.log('='.repeat(120));

for (let i = 0; i < Math.min(10, rawData.length); i++) {
  const row = rawData[i];
  console.log(`Row ${i}:`);
  if (row) {
    row.forEach((cell, idx) => {
      if (cell !== undefined && cell !== null && String(cell).trim()) {
        console.log(`  Col ${idx}: ${String(cell).substring(0, 100)}`);
      }
    });
  }
  console.log('-'.repeat(60));
}

// Try to find where the actual data starts
console.log('\n🔍 Looking for actual district data...');
for (let i = 0; i < Math.min(20, rawData.length); i++) {
  const row = rawData[i];
  if (row && row[0] && String(row[0]).match(/^\d{14}$/)) {
    console.log(`\nFound potential district data at row ${i}:`);
    console.log('Sample row:');
    row.forEach((cell, idx) => {
      if (cell !== undefined && cell !== null && String(cell).trim()) {
        console.log(`  Col ${idx}: ${String(cell)}`);
      }
    });
    break;
  }
}