import { createClient } from '@/lib/supabase/server';

/**
 * Integration tests for QR upload feature
 * Run with: npx tsx tests/qr-upload/integration-test.ts
 */

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message?: string;
  details?: any;
}

const results: TestResult[] = [];

async function testDatabaseTables() {
  console.log('\n🔍 Testing Database Tables...');
  const supabase = await createClient();
  
  try {
    // Test upload_rate_limits table
    const { error: rateLimitError } = await supabase
      .from('upload_rate_limits')
      .select('*')
      .limit(1);
    
    results.push({
      test: 'upload_rate_limits table exists',
      status: rateLimitError ? 'FAIL' : 'PASS',
      message: rateLimitError?.message
    });
    
    // Test analytics_events table
    const { error: analyticsError } = await supabase
      .from('analytics_events')
      .select('*')
      .limit(1);
    
    results.push({
      test: 'analytics_events table exists',
      status: analyticsError ? 'FAIL' : 'PASS',
      message: analyticsError?.message
    });
    
  } catch (error: any) {
    results.push({
      test: 'Database connection',
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testWorksheetQRCodes() {
  console.log('\n🔍 Testing Worksheet QR Codes...');
  const supabase = await createClient();
  
  try {
    // Get recent worksheets
    const { data: worksheets, error } = await supabase
      .from('worksheets')
      .select('id, qr_code, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      results.push({
        test: 'Fetch recent worksheets',
        status: 'FAIL',
        message: error.message
      });
      return;
    }
    
    if (!worksheets || worksheets.length === 0) {
      results.push({
        test: 'Recent worksheets exist',
        status: 'SKIP',
        message: 'No worksheets found to test'
      });
      return;
    }
    
    // Check QR code formats
    let urlFormatCount = 0;
    let jsonFormatCount = 0;
    let stringFormatCount = 0;
    
    for (const worksheet of worksheets) {
      const qr = worksheet.qr_code;
      
      if (qr.startsWith('https://')) {
        urlFormatCount++;
      } else if (qr.startsWith('{')) {
        jsonFormatCount++;
      } else {
        stringFormatCount++;
      }
    }
    
    results.push({
      test: 'QR code format analysis',
      status: 'PASS',
      details: {
        total: worksheets.length,
        urlFormat: urlFormatCount,
        jsonFormat: jsonFormatCount,
        stringFormat: stringFormatCount
      }
    });
    
  } catch (error: any) {
    results.push({
      test: 'QR code analysis',
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testRateLimitRecords() {
  console.log('\n🔍 Testing Rate Limit Records...');
  const supabase = await createClient();
  
  try {
    // Count current rate limit records
    const { count, error } = await supabase
      .from('upload_rate_limits')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      results.push({
        test: 'Count rate limit records',
        status: 'FAIL',
        message: error.message
      });
      return;
    }
    
    // Check for old records
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { count: oldCount, error: oldError } = await supabase
      .from('upload_rate_limits')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', sevenDaysAgo.toISOString());
    
    results.push({
      test: 'Rate limit record status',
      status: 'PASS',
      details: {
        totalRecords: count || 0,
        oldRecords: oldCount || 0,
        needsCleanup: (oldCount || 0) > 0
      }
    });
    
  } catch (error: any) {
    results.push({
      test: 'Rate limit analysis',
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testAnalyticsData() {
  console.log('\n🔍 Testing Analytics Data...');
  const supabase = await createClient();
  
  try {
    // Count QR upload events
    const { count: qrCount, error: qrError } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .in('event', ['qr_upload_started', 'qr_upload_completed', 'qr_upload_failed']);
    
    // Count standard upload events
    const { count: stdCount, error: stdError } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .in('event', ['standard_upload_completed', 'standard_upload_failed']);
    
    if (qrError || stdError) {
      results.push({
        test: 'Analytics event counts',
        status: 'FAIL',
        message: qrError?.message || stdError?.message
      });
      return;
    }
    
    results.push({
      test: 'Analytics data collection',
      status: 'PASS',
      details: {
        qrUploadEvents: qrCount || 0,
        standardUploadEvents: stdCount || 0,
        featureAdoption: qrCount && stdCount ? 
          `${((qrCount / (qrCount + stdCount)) * 100).toFixed(1)}% QR uploads` : 
          'No data yet'
      }
    });
    
  } catch (error: any) {
    results.push({
      test: 'Analytics analysis',
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testEnvironmentVariables() {
  console.log('\n🔍 Testing Environment Variables...');
  
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const optionalVars = [
    'ANTHROPIC_API_KEY',
    'CRON_SECRET',
    'CLEANUP_ANALYTICS'
  ];
  
  for (const varName of requiredVars) {
    results.push({
      test: `Required env var: ${varName}`,
      status: process.env[varName] ? 'PASS' : 'FAIL',
      message: process.env[varName] ? 'Set' : 'Missing'
    });
  }
  
  for (const varName of optionalVars) {
    results.push({
      test: `Optional env var: ${varName}`,
      status: process.env[varName] ? 'PASS' : 'SKIP',
      message: process.env[varName] ? 'Set' : 'Not set'
    });
  }
}

// Print results summary
function printResults() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📊 Total: ${results.length}`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`\n  • ${r.test}`);
      if (r.message) console.log(`    Error: ${r.message}`);
    });
  }
  
  console.log('\n📋 DETAILED RESULTS:');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`\n${icon} ${r.test}`);
    if (r.message) console.log(`   ${r.message}`);
    if (r.details) console.log(`   Details:`, r.details);
  });
}

// Run all tests
async function runIntegrationTests() {
  console.log('🚀 Starting QR Upload Integration Tests...');
  
  await testEnvironmentVariables();
  await testDatabaseTables();
  await testWorksheetQRCodes();
  await testRateLimitRecords();
  await testAnalyticsData();
  
  printResults();
}

// CLI entry point
if (require.main === module) {
  runIntegrationTests()
    .then(() => process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0))
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}