import { createClient } from '@/lib/supabase/server';
import QRCode from 'qrcode';

/**
 * Generate test worksheets with QR codes for manual testing
 * Run with: npx tsx tests/qr-upload/generate-test-data.ts
 */

async function generateTestWorksheets() {
  const supabase = await createClient();
  
  console.log('🎯 Generating test worksheets...\n');
  
  // Get a test student (or create one)
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id, initials, grade_level')
    .limit(1);
  
  if (studentError || !students?.length) {
    console.error('❌ No students found. Please create at least one student first.');
    return;
  }
  
  const student = students[0];
  console.log(`Using student: ${student.initials} (Grade ${student.grade_level})\n`);
  
  // Test worksheet configurations
  const testWorksheets = [
    {
      name: 'URL Format QR Code',
      type: 'spelling',
      qrFormat: 'url'
    },
    {
      name: 'Legacy JSON Format',
      type: 'math',
      qrFormat: 'json'
    },
    {
      name: 'Legacy String Format',
      type: 'reading_comprehension',
      qrFormat: 'string'
    }
  ];
  
  for (const config of testWorksheets) {
    console.log(`Creating worksheet: ${config.name}`);
    
    // Generate worksheet code
    const worksheetCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    // Format QR code content based on type
    let qrContent: string;
    switch (config.qrFormat) {
      case 'url':
        qrContent = `https://app.speddy.com/ws/${worksheetCode}`;
        break;
      case 'json':
        qrContent = JSON.stringify({ worksheetCode });
        break;
      case 'string':
        qrContent = worksheetCode;
        break;
      default:
        qrContent = worksheetCode;
    }
    
    // Create worksheet record
    const { data: worksheet, error: worksheetError } = await supabase
      .from('worksheets')
      .insert({
        student_id: student.id,
        worksheet_type: config.type,
        qr_code: worksheetCode, // Store just the code in DB
        content: {
          questions: [
            { id: '1', question: 'Test Question 1', answer: 'Answer 1' },
            { id: '2', question: 'Test Question 2', answer: 'Answer 2' }
          ]
        },
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (worksheetError) {
      console.error(`❌ Failed to create worksheet: ${worksheetError.message}`);
      continue;
    }
    
    console.log(`✅ Created worksheet ID: ${worksheet.id}`);
    console.log(`   QR Code: ${worksheetCode}`);
    console.log(`   Format: ${config.qrFormat}`);
    console.log(`   Content: ${qrContent}`);
    
    // Generate QR code image
    try {
      const qrDataUrl = await QRCode.toDataURL(qrContent, {
        width: 200,
        margin: 2
      });
      
      console.log(`   QR Image: Generated (${qrDataUrl.length} chars)`);
    } catch (qrError) {
      console.error(`   QR Image: Failed to generate`);
    }
    
    console.log('');
  }
  
  console.log('\n📝 Test Instructions:');
  console.log('1. Print or display these QR codes');
  console.log('2. Scan with phone camera');
  console.log('3. Test upload flow');
  console.log('4. Check rate limiting');
  console.log('5. Verify analytics tracking');
}

async function generateRateLimitTestData() {
  const supabase = await createClient();
  
  console.log('\n🚦 Generating rate limit test data...\n');
  
  const testIP = '192.168.1.100';
  const testWorksheetCode = 'RATELIMIT123';
  
  // Create multiple rate limit records
  const records = [];
  const now = new Date();
  
  // Add records from last hour (should count toward limit)
  for (let i = 0; i < 15; i++) {
    const timestamp = new Date(now.getTime() - i * 3 * 60 * 1000); // Every 3 minutes
    records.push({
      ip_address: testIP,
      worksheet_code: `TEST${i}`,
      created_at: timestamp.toISOString()
    });
  }
  
  // Add old records (should be cleaned up)
  for (let i = 0; i < 5; i++) {
    const timestamp = new Date(now.getTime() - (8 + i) * 24 * 60 * 60 * 1000); // 8+ days old
    records.push({
      ip_address: testIP,
      worksheet_code: `OLD${i}`,
      created_at: timestamp.toISOString()
    });
  }
  
  const { error } = await supabase
    .from('upload_rate_limits')
    .insert(records);
  
  if (error) {
    console.error('❌ Failed to create rate limit records:', error.message);
  } else {
    console.log(`✅ Created ${records.length} rate limit test records`);
    console.log(`   Test IP: ${testIP}`);
    console.log(`   Recent records: 15 (last hour)`);
    console.log(`   Old records: 5 (8+ days old)`);
  }
}

async function generateAnalyticsTestData() {
  const supabase = await createClient();
  
  console.log('\n📊 Generating analytics test data...\n');
  
  const events = [];
  const now = new Date();
  
  // Generate variety of events
  const eventTypes = [
    { event: 'qr_upload_started', count: 50 },
    { event: 'qr_upload_image_selected', count: 45 },
    { event: 'qr_upload_completed', count: 40 },
    { event: 'qr_upload_failed', count: 5 },
    { event: 'standard_upload_completed', count: 20 },
    { event: 'standard_upload_failed', count: 2 }
  ];
  
  const devices = ['mobile', 'desktop', 'tablet'];
  const errorCodes = ['rate_limit', 'qr_mismatch', 'network', 'generic'];
  
  for (const eventType of eventTypes) {
    for (let i = 0; i < eventType.count; i++) {
      const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Last 7 days
      const device = devices[Math.floor(Math.random() * devices.length)];
      
      const event: any = {
        event: eventType.event,
        worksheet_code: `WS${Math.floor(Math.random() * 1000)}`,
        device_type: device,
        created_at: timestamp.toISOString()
      };
      
      // Add error details for failed events
      if (eventType.event.includes('failed')) {
        event.error_code = errorCodes[Math.floor(Math.random() * errorCodes.length)];
        event.error_message = `Test error for ${event.error_code}`;
      }
      
      // Add processing time for completed events
      if (eventType.event.includes('completed')) {
        event.processing_time = 1000 + Math.floor(Math.random() * 4000); // 1-5 seconds
        event.file_size = 500000 + Math.floor(Math.random() * 2000000); // 0.5-2.5MB
      }
      
      events.push(event);
    }
  }
  
  const { error } = await supabase
    .from('analytics_events')
    .insert(events);
  
  if (error) {
    console.error('❌ Failed to create analytics events:', error.message);
  } else {
    console.log(`✅ Created ${events.length} analytics test events`);
    console.log('   Event distribution:');
    eventTypes.forEach(et => {
      console.log(`     ${et.event}: ${et.count}`);
    });
  }
}

// Main function
async function generateAllTestData() {
  console.log('🚀 QR Upload Test Data Generator');
  console.log('================================\n');
  
  await generateTestWorksheets();
  await generateRateLimitTestData();
  await generateAnalyticsTestData();
  
  console.log('\n✅ Test data generation complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Run the integration tests: npx tsx tests/qr-upload/integration-test.ts');
  console.log('2. Test the QR upload flow manually');
  console.log('3. Check the analytics dashboard');
  console.log('4. Test the cleanup cron job');
}

// CLI entry point
if (require.main === module) {
  generateAllTestData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Failed to generate test data:', error);
      process.exit(1);
    });
}