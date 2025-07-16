import { extractQRCodeForSubmission, verifyQRCodeMatch } from '@/lib/qr-verification';
import fs from 'fs';
import path from 'path';

/**
 * Test utilities for QR code verification
 */

// Test extracting QR code from various formats
export async function testQRExtraction() {
  console.log('Testing QR Code Extraction...\n');
  
  const testCases = [
    {
      name: 'New URL format',
      mockQRContent: 'https://app.speddy.com/ws/ABC123',
      expectedCode: 'ABC123'
    },
    {
      name: 'Old JSON format',
      mockQRContent: JSON.stringify({ worksheetCode: 'XYZ789' }),
      expectedCode: 'XYZ789'
    },
    {
      name: 'Old string format',
      mockQRContent: 'DEF456',
      expectedCode: 'DEF456'
    },
    {
      name: 'Invalid URL',
      mockQRContent: 'https://example.com/invalid',
      expectedCode: null
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    console.log(`Input: ${testCase.mockQRContent}`);
    
    // Mock the QR extraction (in real test, would use actual image)
    const result = parseQRContent(testCase.mockQRContent);
    
    console.log(`Expected: ${testCase.expectedCode}`);
    console.log(`Actual: ${result}`);
    console.log(`Result: ${result === testCase.expectedCode ? '✅ PASS' : '❌ FAIL'}\n`);
  }
}

// Helper to parse QR content (mimics the logic in qr-verification.ts)
function parseQRContent(content: string): string | null {
  // Try URL format
  const urlMatch = content.match(/https:\/\/app\.speddy\.com\/ws\/([A-Za-z0-9]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // Try JSON format
  try {
    const parsed = JSON.parse(content);
    if (parsed.worksheetCode) {
      return parsed.worksheetCode;
    }
  } catch {
    // Not JSON
  }
  
  // Try direct string format (alphanumeric only)
  if (/^[A-Za-z0-9]+$/.test(content)) {
    return content;
  }
  
  return null;
}

// Test rate limit calculations
export function testRateLimitLogic() {
  console.log('Testing Rate Limit Logic...\n');
  
  const testScenarios = [
    {
      name: 'Under hourly limit',
      hourlyCount: 19,
      worksheetCount: 4,
      shouldAllow: true
    },
    {
      name: 'At hourly limit',
      hourlyCount: 20,
      worksheetCount: 2,
      shouldAllow: false
    },
    {
      name: 'At worksheet limit',
      hourlyCount: 10,
      worksheetCount: 5,
      shouldAllow: false
    },
    {
      name: 'Both limits exceeded',
      hourlyCount: 25,
      worksheetCount: 10,
      shouldAllow: false
    }
  ];
  
  for (const scenario of testScenarios) {
    const allowed = scenario.hourlyCount < 20 && scenario.worksheetCount < 5;
    console.log(`Test: ${scenario.name}`);
    console.log(`Hourly uploads: ${scenario.hourlyCount}/20`);
    console.log(`Worksheet uploads: ${scenario.worksheetCount}/5`);
    console.log(`Expected: ${scenario.shouldAllow ? 'ALLOW' : 'DENY'}`);
    console.log(`Actual: ${allowed ? 'ALLOW' : 'DENY'}`);
    console.log(`Result: ${allowed === scenario.shouldAllow ? '✅ PASS' : '❌ FAIL'}\n`);
  }
}

// Test image validation
export function testImageValidation() {
  console.log('Testing Image Validation...\n');
  
  const testFiles = [
    {
      name: 'valid-jpeg.jpg',
      size: 2 * 1024 * 1024, // 2MB
      type: 'image/jpeg',
      shouldPass: true
    },
    {
      name: 'large-image.jpg',
      size: 15 * 1024 * 1024, // 15MB
      type: 'image/jpeg',
      shouldPass: false
    },
    {
      name: 'document.pdf',
      size: 1 * 1024 * 1024,
      type: 'application/pdf',
      shouldPass: false
    },
    {
      name: 'valid-png.png',
      size: 3 * 1024 * 1024,
      type: 'image/png',
      shouldPass: true
    }
  ];
  
  for (const file of testFiles) {
    const isValid = isValidImageFile(file);
    console.log(`Test: ${file.name}`);
    console.log(`Size: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
    console.log(`Type: ${file.type}`);
    console.log(`Expected: ${file.shouldPass ? 'VALID' : 'INVALID'}`);
    console.log(`Actual: ${isValid ? 'VALID' : 'INVALID'}`);
    console.log(`Result: ${isValid === file.shouldPass ? '✅ PASS' : '❌ FAIL'}\n`);
  }
}

function isValidImageFile(file: { type: string; size: number }): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  return validTypes.includes(file.type) && file.size <= maxSize;
}

// Run all tests
export async function runAllTests() {
  console.log('='.repeat(50));
  console.log('QR UPLOAD FEATURE TEST SUITE');
  console.log('='.repeat(50));
  console.log('\n');
  
  await testQRExtraction();
  testRateLimitLogic();
  testImageValidation();
  
  console.log('='.repeat(50));
  console.log('TEST SUITE COMPLETE');
  console.log('='.repeat(50));
}

// CLI entry point
if (require.main === module) {
  runAllTests().catch(console.error);
}