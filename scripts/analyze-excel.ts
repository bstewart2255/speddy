#!/usr/bin/env node

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXCEL_FILE_PATH = join(__dirname, '..', 'attached_assets', 'fiscalyear2024to25_1758996157561.xlsx');

async function analyzeExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE_PATH);

  console.log('📋 Sheets in workbook:');
  workbook.worksheets.forEach(ws => console.log(`  - ${ws.name}`));

  const sheet = workbook.getWorksheet('List of Districts');
  if (!sheet) {
    console.error('Sheet "List of Districts" not found');
    return;
  }

  console.log('\n📊 First 10 rows of "List of Districts" sheet:');
  console.log('='.repeat(120));

  let rowCount = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowCount >= 10) return;
    console.log(`Row ${rowNumber - 1}:`);
    row.eachCell((cell, colNumber) => {
      const value = cell.value;
      if (value !== undefined && value !== null && String(value).trim()) {
        console.log(`  Col ${colNumber - 1}: ${String(value).substring(0, 100)}`);
      }
    });
    console.log('-'.repeat(60));
    rowCount++;
  });

  console.log('\n🔍 Looking for actual district data...');
  sheet.eachRow((row, rowNumber) => {
    const firstCell = row.getCell(1).value;
    if (firstCell && String(firstCell).match(/^\d{14}$/)) {
      console.log(`\nFound potential district data at row ${rowNumber - 1}:`);
      console.log('Sample row:');
      row.eachCell((cell, colNumber) => {
        const value = cell.value;
        if (value !== undefined && value !== null && String(value).trim()) {
          console.log(`  Col ${colNumber - 1}: ${String(value)}`);
        }
      });
      return;
    }
  });
}

analyzeExcel().catch(console.error);