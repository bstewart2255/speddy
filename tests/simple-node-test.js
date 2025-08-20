#!/usr/bin/env node

/**
 * Simple Node.js test that doesn't require Playwright or browser dependencies
 * Run with: node tests/simple-node-test.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Running Simple Node.js Tests...\n');
  
  const tests = [];
  let passed = 0;
  let failed = 0;
  
  // Test 1: Server responds
  try {
    console.log('Test 1: Server responds to requests...');
    const response = await makeRequest(BASE_URL);
    if (response.status === 200 || response.status === 307 || response.status === 302) {
      console.log(`✅ PASS: Server responded with ${response.status}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL: Server returned ${response.status}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Could not connect to server: ${error.message}\n`);
    failed++;
  }
  
  // Test 2: HTML content (or redirect)
  try {
    console.log('Test 2: Server returns appropriate response...');
    const response = await makeRequest(BASE_URL);
    // Accept HTML or redirects (which are common for auth-protected apps)
    if (response.headers['content-type']?.includes('text/html') || 
        response.status === 307 || response.status === 302) {
      console.log('✅ PASS: Server returns expected response\n');
      passed++;
    } else {
      console.log(`❌ FAIL: Unexpected response type\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }
  
  // Test 3: Login page exists
  try {
    console.log('Test 3: Login page exists...');
    const response = await makeRequest(`${BASE_URL}/login`);
    if (response.status === 200 || response.status === 307) {
      console.log('✅ PASS: Login page accessible\n');
      passed++;
    } else {
      console.log(`❌ FAIL: Login page returned ${response.status}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }
  
  // Test 4: No server errors on homepage
  try {
    console.log('Test 4: Homepage loads without server errors...');
    const response = await makeRequest(BASE_URL);
    if (response.status < 500) {
      console.log('✅ PASS: No server errors\n');
      passed++;
    } else {
      console.log(`❌ FAIL: Server error ${response.status}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }
  
  // Test 5: Login page has content
  try {
    console.log('Test 5: Login page has content...');
    const response = await makeRequest(`${BASE_URL}/login`);
    // For redirects or pages with content
    if (response.body.length > 100 || response.status === 307 || response.status === 302) {
      console.log('✅ PASS: Login page responds with content\n');
      passed++;
    } else {
      console.log('❌ FAIL: Login page has no content\n');
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }
  
  // Summary
  console.log('═'.repeat(50));
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📝 Total:  ${passed + failed}\n`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});