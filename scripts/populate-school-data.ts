#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parse';
import { promisify } from 'util';
import pLimit from 'p-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '100'),
  RATE_LIMIT_DELAY: parseInt(process.env.RATE_LIMIT_DELAY || '1000'), // ms between batches
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
  CONCURRENT_REQUESTS: parseInt(process.env.CONCURRENT_REQUESTS || '5'),
  PROGRESS_FILE: './nces-import-progress.json',
  ERROR_LOG_FILE: './nces-import-errors.log',
  // NCES API endpoints
  NCES_DISTRICTS_API: 'https://educationdata.urban.org/api/v1/schools/ccd/directory/',
  NCES_SCHOOLS_API: 'https://educationdata.urban.org/api/v1/schools/ccd/directory/',
  // Alternative: Use downloaded CSV files if API is restrictive
  USE_CSV_FALLBACK: process.env.USE_CSV_FALLBACK === 'true',
  DISTRICTS_CSV_PATH: process.env.DISTRICTS_CSV_PATH || './data/districts.csv',
  SCHOOLS_CSV_PATH: process.env.SCHOOLS_CSV_PATH || './data/schools.csv',
};

// Types
interface State {
  id: string;
  name: string;
  abbreviation: string;
}

interface District {
  id: string;
  state_id: string;
  name: string;
  nces_id?: string;
  city?: string;
  zip_code?: string;
  county?: string;
  phone?: string;
  website?: string;
  superintendent_name?: string;
  enrollment_total?: number;
  schools_count?: number;
  grade_span_low?: string;
  grade_span_high?: string;
  urban_centric_locale?: string;
  is_active?: boolean;
}

interface School {
  id: string;
  district_id: string;
  state_id: string;
  name: string;
  nces_id?: string;
  school_type?: string;
  grade_span_low?: string;
  grade_span_high?: string;
  street_address?: string;
  city?: string;
  zip_code?: string;
  phone?: string;
  website?: string;
  principal_name?: string;
  enrollment_total?: number;
  teachers_fte?: number;
  student_teacher_ratio?: number;
  free_reduced_lunch_eligible?: number;
  charter_school?: boolean;
  magnet_school?: boolean;
  title_i_school?: boolean;
  urban_centric_locale?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
}

interface ImportProgress {
  lastProcessedState?: string;
  lastProcessedDistrictId?: string;
  lastProcessedSchoolId?: string;
  totalDistrictsProcessed: number;
  totalSchoolsProcessed: number;
  totalErrors: number;
  startTime: string;
  lastUpdateTime: string;
}

interface NCESDistrictData {
  leaid: string;
  lea_name: string;
  state_location: string;
  city_location: string;
  zip_location: string;
  county_name: string;
  phone: string;
  website: string;
  enrollment: number;
  number_of_schools: number;
  lowest_grade_offered: string;
  highest_grade_offered: string;
  urban_centric_locale: string;
  operational_status: number;
}

interface NCESSchoolData {
  ncessch: string;
  school_name: string;
  leaid: string;
  state_location: string;
  school_type: string;
  lowest_grade_offered: string;
  highest_grade_offered: string;
  street_location: string;
  city_location: string;
  zip_location: string;
  phone: string;
  website: string;
  enrollment: number;
  teachers_total_fte: number;
  student_teacher_ratio: number;
  free_lunch_eligible: number;
  reduced_lunch_eligible: number;
  charter: number;
  magnet: number;
  title_i_eligible: number;
  urban_centric_locale: string;
  latitude: number;
  longitude: number;
  operational_status: number;
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

// Utility functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const writeErrorLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  fs.appendFileSync(CONFIG.ERROR_LOG_FILE, logEntry);
  console.error(`❌ ${message}`);
};

const saveProgress = (progress: ImportProgress) => {
  fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

const loadProgress = (): ImportProgress | null => {
  if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG.PROGRESS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('⚠️  Could not load progress file, starting fresh');
      return null;
    }
  }
  return null;
};

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries = CONFIG.MAX_RETRIES,
  delay = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    
    console.log(`⏳ Retrying after ${delay}ms... (${CONFIG.MAX_RETRIES - retries + 1}/${CONFIG.MAX_RETRIES})`);
    await sleep(delay);
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
};

// Data transformation functions
const transformDistrictData = (raw: NCESDistrictData, stateId: string): District => {
  return {
    id: raw.leaid,
    state_id: stateId,
    name: raw.lea_name?.trim() || '',
    nces_id: raw.leaid,
    city: raw.city_location?.trim(),
    zip_code: raw.zip_location?.trim(),
    county: raw.county_name?.trim(),
    phone: raw.phone?.trim(),
    website: raw.website?.trim(),
    enrollment_total: raw.enrollment || 0,
    schools_count: raw.number_of_schools || 0,
    grade_span_low: raw.lowest_grade_offered,
    grade_span_high: raw.highest_grade_offered,
    urban_centric_locale: raw.urban_centric_locale,
    is_active: raw.operational_status === 1,
  };
};

const transformSchoolData = (raw: NCESSchoolData, stateId: string): School => {
  return {
    id: raw.ncessch,
    district_id: raw.leaid,
    state_id: stateId,
    name: raw.school_name?.trim() || '',
    nces_id: raw.ncessch,
    school_type: raw.school_type,
    grade_span_low: raw.lowest_grade_offered,
    grade_span_high: raw.highest_grade_offered,
    street_address: raw.street_location?.trim(),
    city: raw.city_location?.trim(),
    zip_code: raw.zip_location?.trim(),
    phone: raw.phone?.trim(),
    website: raw.website?.trim(),
    enrollment_total: raw.enrollment || 0,
    teachers_fte: raw.teachers_total_fte || 0,
    student_teacher_ratio: raw.student_teacher_ratio || 0,
    free_reduced_lunch_eligible: (raw.free_lunch_eligible || 0) + (raw.reduced_lunch_eligible || 0),
    charter_school: raw.charter === 1,
    magnet_school: raw.magnet === 1,
    title_i_school: raw.title_i_eligible === 1,
    urban_centric_locale: raw.urban_centric_locale,
    latitude: raw.latitude,
    longitude: raw.longitude,
    is_active: raw.operational_status === 1,
  };
};

// API fetch functions
const fetchDistrictsFromAPI = async (stateCode: string): Promise<NCESDistrictData[]> => {
  try {
    console.log(`📡 Fetching districts for ${stateCode} from API...`);
    const url = `${CONFIG.NCES_DISTRICTS_API}?year=2022&fips=${stateCode}`;
    const response = await axios.get<{ results: NCESDistrictData[] }>(url);
    return response.data.results || [];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`API request failed: ${error.response?.status} - ${error.message}`);
    }
    throw error;
  }
};

const fetchSchoolsFromAPI = async (districtId: string): Promise<NCESSchoolData[]> => {
  try {
    const url = `${CONFIG.NCES_SCHOOLS_API}?year=2022&leaid=${districtId}`;
    const response = await axios.get<{ results: NCESSchoolData[] }>(url);
    return response.data.results || [];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`API request failed: ${error.response?.status} - ${error.message}`);
    }
    throw error;
  }
};

// CSV parsing functions
const parseDistrictsCSV = async (filePath: string): Promise<NCESDistrictData[]> => {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parser = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });
  
  const districts: NCESDistrictData[] = [];
  for await (const record of parser) {
    districts.push(record as NCESDistrictData);
  }
  return districts;
};

const parseSchoolsCSV = async (filePath: string): Promise<NCESSchoolData[]> => {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parser = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });
  
  const schools: NCESSchoolData[] = [];
  for await (const record of parser) {
    schools.push(record as NCESSchoolData);
  }
  return schools;
};

// Database insertion functions
const insertDistrictsBatch = async (districts: District[]): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from('districts')
      .upsert(districts, { onConflict: 'id' });
    
    if (error) throw error;
    return districts.length;
  } catch (error) {
    writeErrorLog(`Failed to insert districts batch`, { error, sample: districts[0] });
    throw error;
  }
};

const insertSchoolsBatch = async (schools: School[]): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from('schools')
      .upsert(schools, { onConflict: 'id' });
    
    if (error) throw error;
    return schools.length;
  } catch (error) {
    writeErrorLog(`Failed to insert schools batch`, { error, sample: schools[0] });
    throw error;
  }
};

// Main import functions
const importDistrictsForState = async (
  state: State,
  progress: ImportProgress
): Promise<number> => {
  console.log(`\n📚 Processing districts for ${state.name} (${state.id})...`);
  
  let districts: NCESDistrictData[];
  
  if (CONFIG.USE_CSV_FALLBACK) {
    districts = await parseDistrictsCSV(CONFIG.DISTRICTS_CSV_PATH);
    districts = districts.filter(d => d.state_location === state.id);
  } else {
    districts = await fetchDistrictsFromAPI(state.id);
  }
  
  console.log(`  Found ${districts.length} districts`);
  
  let processedCount = 0;
  const batches = [];
  
  for (let i = 0; i < districts.length; i += CONFIG.BATCH_SIZE) {
    const batch = districts.slice(i, i + CONFIG.BATCH_SIZE);
    const transformedBatch = batch.map(d => transformDistrictData(d, state.id));
    batches.push(transformedBatch);
  }
  
  for (const [index, batch] of batches.entries()) {
    try {
      await retryWithBackoff(() => insertDistrictsBatch(batch));
      processedCount += batch.length;
      
      // Update progress
      progress.totalDistrictsProcessed += batch.length;
      progress.lastProcessedDistrictId = batch[batch.length - 1].id;
      progress.lastUpdateTime = new Date().toISOString();
      saveProgress(progress);
      
      console.log(`  ✅ Batch ${index + 1}/${batches.length} complete (${processedCount}/${districts.length})`);
      
      // Rate limiting
      if (index < batches.length - 1) {
        await sleep(CONFIG.RATE_LIMIT_DELAY);
      }
    } catch (error) {
      progress.totalErrors += batch.length;
      writeErrorLog(`Failed to process district batch ${index + 1}`, error);
    }
  }
  
  return processedCount;
};

const importSchoolsForDistrict = async (
  districtId: string,
  stateId: string,
  progress: ImportProgress
): Promise<number> => {
  let schools: NCESSchoolData[];
  
  if (CONFIG.USE_CSV_FALLBACK) {
    const allSchools = await parseSchoolsCSV(CONFIG.SCHOOLS_CSV_PATH);
    schools = allSchools.filter(s => s.leaid === districtId);
  } else {
    schools = await fetchSchoolsFromAPI(districtId);
  }
  
  if (schools.length === 0) return 0;
  
  const transformedSchools = schools.map(s => transformSchoolData(s, stateId));
  
  try {
    await retryWithBackoff(() => insertSchoolsBatch(transformedSchools));
    progress.totalSchoolsProcessed += transformedSchools.length;
    progress.lastProcessedSchoolId = transformedSchools[transformedSchools.length - 1].id;
    return transformedSchools.length;
  } catch (error) {
    progress.totalErrors += transformedSchools.length;
    writeErrorLog(`Failed to insert schools for district ${districtId}`, error);
    return 0;
  }
};

const importAllSchools = async (progress: ImportProgress) => {
  console.log('\n🏫 Starting school import process...');
  
  // Get all districts
  const { data: districts, error } = await supabase
    .from('districts')
    .select('id, state_id, name')
    .eq('is_active', true)
    .order('state_id');
  
  if (error || !districts) {
    writeErrorLog('Failed to fetch districts', error);
    return;
  }
  
  console.log(`  Found ${districts.length} active districts to process`);
  
  // Process schools with concurrency limit
  const limit = pLimit(CONFIG.CONCURRENT_REQUESTS);
  let processedDistricts = 0;
  
  const tasks = districts.map(district => 
    limit(async () => {
      const schoolCount = await importSchoolsForDistrict(
        district.id,
        district.state_id,
        progress
      );
      
      processedDistricts++;
      if (processedDistricts % 100 === 0) {
        console.log(`  Progress: ${processedDistricts}/${districts.length} districts processed`);
        progress.lastUpdateTime = new Date().toISOString();
        saveProgress(progress);
      }
      
      // Rate limiting
      await sleep(CONFIG.RATE_LIMIT_DELAY);
      
      return schoolCount;
    })
  );
  
  const results = await Promise.all(tasks);
  const totalSchools = results.reduce((sum, count) => sum + count, 0);
  
  console.log(`✅ Imported ${totalSchools} schools from ${districts.length} districts`);
};

// Main execution
const main = async () => {
  console.log('🚀 NCES School Data Import Script');
  console.log('==================================\n');
  
  // Validate configuration
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  // Load or create progress tracking
  let progress = loadProgress();
  if (progress) {
    console.log('📂 Resuming from previous progress:');
    console.log(`  Districts processed: ${progress.totalDistrictsProcessed}`);
    console.log(`  Schools processed: ${progress.totalSchoolsProcessed}`);
    console.log(`  Errors encountered: ${progress.totalErrors}`);
    console.log(`  Last update: ${progress.lastUpdateTime}\n`);
  } else {
    progress = {
      totalDistrictsProcessed: 0,
      totalSchoolsProcessed: 0,
      totalErrors: 0,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
    };
    saveProgress(progress);
  }
  
  try {
    // Get all states
    const { data: states, error } = await supabase
      .from('states')
      .select('*')
      .order('id');
    
    if (error || !states) {
      throw new Error(`Failed to fetch states from database: ${error?.message || 'No data returned'}`);
    }
    
    console.log(`📍 Found ${states.length} states/territories to process\n`);
    
    // Process districts for each state
    let startIndex = 0;
    if (progress.lastProcessedState) {
      startIndex = states.findIndex(s => s.id === progress.lastProcessedState) + 1;
      console.log(`📌 Resuming from state: ${states[startIndex]?.name || 'beginning'}\n`);
    }
    
    for (let i = startIndex; i < states.length; i++) {
      const state = states[i];
      progress.lastProcessedState = state.id;
      
      const districtCount = await importDistrictsForState(state, progress);
      console.log(`  ✅ Completed ${state.name}: ${districtCount} districts imported`);
      
      // Save progress after each state
      saveProgress(progress);
      
      // Small delay between states
      await sleep(2000);
    }
    
    console.log('\n✅ District import complete!');
    console.log(`  Total districts: ${progress.totalDistrictsProcessed}`);
    
    // Import all schools
    await importAllSchools(progress);
    
    // Final summary
    const duration = Date.now() - new Date(progress.startTime).getTime();
    const durationMinutes = Math.round(duration / 60000);
    
    console.log('\n🎉 Import Complete!');
    console.log('===================');
    console.log(`  Total Districts: ${progress.totalDistrictsProcessed.toLocaleString()}`);
    console.log(`  Total Schools: ${progress.totalSchoolsProcessed.toLocaleString()}`);
    console.log(`  Total Errors: ${progress.totalErrors}`);
    console.log(`  Duration: ${durationMinutes} minutes`);
    console.log(`  Error log: ${CONFIG.ERROR_LOG_FILE}`);
    
    // Update database import tracking
    await supabase.from('nces_import_progress').insert({
      import_type: 'complete',
      total_records: progress.totalDistrictsProcessed + progress.totalSchoolsProcessed,
      processed_records: progress.totalDistrictsProcessed + progress.totalSchoolsProcessed,
      failed_records: progress.totalErrors,
      status: 'completed',
      started_at: progress.startTime,
      completed_at: new Date().toISOString(),
    });
    
    // Clean up progress file on successful completion
    if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
      fs.unlinkSync(CONFIG.PROGRESS_FILE);
    }
    
  } catch (error) {
    console.error('❌ Fatal error during import:', error);
    writeErrorLog('Fatal error during import', error);
    progress.lastUpdateTime = new Date().toISOString();
    saveProgress(progress);
    process.exit(1);
  }
};

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { main };