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

// Major California school districts and some of their elementary schools
// Using NCES IDs where available, otherwise using generated IDs
const californiaDistricts = [
  // Northern California
  {
    id: '0601770',
    name: 'San Francisco Unified School District',
    city: 'San Francisco',
    county: 'San Francisco',
    zip: '94102',
    schools: [
      { name: 'Alamo Elementary School', id: '060177000001' },
      { name: 'Argonne Elementary School', id: '060177000002' },
      { name: 'Bryant Elementary School', id: '060177000003' },
      { name: 'Clarendon Elementary School', id: '060177000004' },
      { name: 'Cleveland Elementary School', id: '060177000005' },
      { name: 'Commodore Sloat Elementary School', id: '060177000006' },
      { name: 'Dianne Feinstein Elementary School', id: '060177000007' },
      { name: 'George Washington Elementary School', id: '060177000008' },
      { name: 'Glen Park Elementary School', id: '060177000009' },
      { name: 'Grattan Elementary School', id: '060177000010' }
    ]
  },
  {
    id: '0612210',
    name: 'Oakland Unified School District',
    city: 'Oakland',
    county: 'Alameda',
    zip: '94607',
    schools: [
      { name: 'Acorn Woodland Elementary School', id: '061221000001' },
      { name: 'Allendale Elementary School', id: '061221000002' },
      { name: 'Bella Vista Elementary School', id: '061221000003' },
      { name: 'Brookfield Elementary School', id: '061221000004' },
      { name: 'Burckhalter Elementary School', id: '061221000005' },
      { name: 'Carl B. Munck Elementary School', id: '061221000006' },
      { name: 'Chabot Elementary School', id: '061221000007' },
      { name: 'Cleveland Elementary School', id: '061221000008' },
      { name: 'Crocker Highlands Elementary School', id: '061221000009' },
      { name: 'Emerson Elementary School', id: '061221000010' }
    ]
  },
  {
    id: '0634320',
    name: 'Sacramento City Unified School District',
    city: 'Sacramento',
    county: 'Sacramento',
    zip: '95814',
    schools: [
      { name: 'Albert Einstein Middle School', id: '063432000001' },
      { name: 'Alice Birney Elementary School', id: '063432000002' },
      { name: 'Bret Harte Elementary School', id: '063432000003' },
      { name: 'Camellia Elementary School', id: '063432000004' },
      { name: 'Capitol Avenue Elementary School', id: '063432000005' },
      { name: 'Caroline Wenzel Elementary School', id: '063432000006' },
      { name: 'Cesar Chavez Elementary School', id: '063432000007' },
      { name: 'David Lubin Elementary School', id: '063432000008' },
      { name: 'Earl Warren Elementary School', id: '063432000009' },
      { name: 'Edward Kemble Elementary School', id: '063432000010' }
    ]
  },
  {
    id: '0633510',
    name: 'San Jose Unified School District',
    city: 'San Jose',
    county: 'Santa Clara',
    zip: '95112',
    schools: [
      { name: 'Allen at Steinbeck Elementary School', id: '063351000001' },
      { name: 'Bachrodt Elementary School', id: '063351000002' },
      { name: 'Canoas Elementary School', id: '063351000003' },
      { name: 'Empire Gardens Elementary School', id: '063351000004' },
      { name: 'Erikson Elementary School', id: '063351000005' },
      { name: 'Forest Hill Elementary School', id: '063351000006' },
      { name: 'Franklin Elementary School', id: '063351000007' },
      { name: 'Gardner Elementary School', id: '063351000008' },
      { name: 'Grant Elementary School', id: '063351000009' },
      { name: 'Graystone Elementary School', id: '063351000010' }
    ]
  },
  {
    id: '0610650',
    name: 'Fresno Unified School District',
    city: 'Fresno',
    county: 'Fresno',
    zip: '93721',
    schools: [
      { name: 'Addams Elementary School', id: '061065000001' },
      { name: 'Ahwahnee Middle School', id: '061065000002' },
      { name: 'Ann B. Leavenworth Elementary School', id: '061065000003' },
      { name: 'Anthony Elementary School', id: '061065000004' },
      { name: 'Ayer Elementary School', id: '061065000005' },
      { name: 'Bakman Elementary School', id: '061065000006' },
      { name: 'Balderas Elementary School', id: '061065000007' },
      { name: 'Birney Elementary School', id: '061065000008' },
      { name: 'Burroughs Elementary School', id: '061065000009' },
      { name: 'Calwa Elementary School', id: '061065000010' }
    ]
  },

  // Southern California
  {
    id: '0619320',
    name: 'Los Angeles Unified School District',
    city: 'Los Angeles',
    county: 'Los Angeles',
    zip: '90017',
    schools: [
      { name: '10th Street Elementary School', id: '061932000001' },
      { name: '107th Street Elementary School', id: '061932000002' },
      { name: '109th Street Elementary School', id: '061932000003' },
      { name: '112th Street Elementary School', id: '061932000004' },
      { name: '116th Street Elementary School', id: '061932000005' },
      { name: '118th Street Elementary School', id: '061932000006' },
      { name: '122nd Street Elementary School', id: '061932000007' },
      { name: '135th Street Elementary School', id: '061932000008' },
      { name: '153rd Street Elementary School', id: '061932000009' },
      { name: '156th Street Elementary School', id: '061932000010' },
      { name: 'Alexandria Avenue Elementary School', id: '061932000011' },
      { name: 'Angeles Mesa Elementary School', id: '061932000012' },
      { name: 'Arlington Heights Elementary School', id: '061932000013' },
      { name: 'Ascot Avenue Elementary School', id: '061932000014' },
      { name: 'Avalon Gardens Elementary School', id: '061932000015' }
    ]
  },
  {
    id: '0637110',
    name: 'San Diego Unified School District',
    city: 'San Diego',
    county: 'San Diego',
    zip: '92103',
    schools: [
      { name: 'Adams Elementary School', id: '063711000001' },
      { name: 'Alcott Elementary School', id: '063711000002' },
      { name: 'Alice Birney Elementary School', id: '063711000003' },
      { name: 'Angier Elementary School', id: '063711000004' },
      { name: 'Audubon Elementary School', id: '063711000005' },
      { name: 'Baker Elementary School', id: '063711000006' },
      { name: 'Balboa Elementary School', id: '063711000007' },
      { name: 'Barnard Elementary School', id: '063711000008' },
      { name: 'Bay Park Elementary School', id: '063711000009' },
      { name: 'Bayview Elementary School', id: '063711000010' }
    ]
  },
  {
    id: '0619350',
    name: 'Long Beach Unified School District',
    city: 'Long Beach',
    county: 'Los Angeles',
    zip: '90806',
    schools: [
      { name: 'Addams Elementary School', id: '061935000001' },
      { name: 'Alvarado Elementary School', id: '061935000002' },
      { name: 'Barton Elementary School', id: '061935000003' },
      { name: 'Birney Elementary School', id: '061935000004' },
      { name: 'Bobbie Smith Elementary School', id: '061935000005' },
      { name: 'Burcham Elementary School', id: '061935000006' },
      { name: 'Burbank Elementary School', id: '061935000007' },
      { name: 'Burnett Elementary School', id: '061935000008' },
      { name: 'Carver Elementary School', id: '061935000009' },
      { name: 'Chavez Elementary School', id: '061935000010' }
    ]
  },
  {
    id: '0622710',
    name: 'Orange County Department of Education',
    city: 'Costa Mesa',
    county: 'Orange',
    zip: '92626',
    schools: [
      { name: 'ACCESS Elementary School', id: '062271000001' },
      { name: 'College View Elementary School', id: '062271000002' },
      { name: 'Harbor View Elementary School', id: '062271000003' },
      { name: 'Lake View Elementary School', id: '062271000004' },
      { name: 'Mountain View Elementary School', id: '062271000005' }
    ]
  },
  {
    id: '0630360',
    name: 'Santa Ana Unified School District',
    city: 'Santa Ana',
    county: 'Orange',
    zip: '92701',
    schools: [
      { name: 'Adams Elementary School', id: '063036000001' },
      { name: 'Carver Elementary School', id: '063036000002' },
      { name: 'Davis Elementary School', id: '063036000003' },
      { name: 'Diamond Elementary School', id: '063036000004' },
      { name: 'Edison Elementary School', id: '063036000005' },
      { name: 'Esqueda Elementary School', id: '063036000006' },
      { name: 'Garfield Elementary School', id: '063036000007' },
      { name: 'Grant Elementary School', id: '063036000008' },
      { name: 'Harvey Elementary School', id: '063036000009' },
      { name: 'Heroes Elementary School', id: '063036000010' }
    ]
  },

  // Central Valley
  {
    id: '0641010',
    name: 'Stockton Unified School District',
    city: 'Stockton',
    county: 'San Joaquin',
    zip: '95202',
    schools: [
      { name: 'Adams Elementary School', id: '064101000001' },
      { name: 'August Elementary School', id: '064101000002' },
      { name: 'Bush Elementary School', id: '064101000003' },
      { name: 'Cleveland Elementary School', id: '064101000004' },
      { name: 'El Dorado Elementary School', id: '064101000005' },
      { name: 'Elmwood Elementary School', id: '064101000006' },
      { name: 'Fair Oaks Elementary School', id: '064101000007' },
      { name: 'Franklin Elementary School', id: '064101000008' },
      { name: 'Garfield Elementary School', id: '064101000009' },
      { name: 'Grunsky Elementary School', id: '064101000010' }
    ]
  },
  {
    id: '0615240',
    name: 'Bakersfield City School District',
    city: 'Bakersfield',
    county: 'Kern',
    zip: '93301',
    schools: [
      { name: 'Almondale Elementary School', id: '061524000001' },
      { name: 'Beardsley Elementary School', id: '061524000002' },
      { name: 'Casa Loma Elementary School', id: '061524000003' },
      { name: 'Castle Elementary School', id: '061524000004' },
      { name: 'Cesar Chavez Elementary School', id: '061524000005' },
      { name: 'Chipman Elementary School', id: '061524000006' },
      { name: 'Curran Elementary School', id: '061524000007' },
      { name: 'Downtown Elementary School', id: '061524000008' },
      { name: 'Eissler Elementary School', id: '061524000009' },
      { name: 'Emerson Elementary School', id: '061524000010' }
    ]
  },
  {
    id: '0620550',
    name: 'Modesto City Schools',
    city: 'Modesto',
    county: 'Stanislaus',
    zip: '95354',
    schools: [
      { name: 'Bret Harte Elementary School', id: '062055000001' },
      { name: 'Burbank Elementary School', id: '062055000002' },
      { name: 'Coleman Brown Elementary School', id: '062055000003' },
      { name: 'El Vista Elementary School', id: '062055000004' },
      { name: 'Enslen Elementary School', id: '062055000005' },
      { name: 'Everett Elementary School', id: '062055000006' },
      { name: 'Fairview Elementary School', id: '062055000007' },
      { name: 'Franklin Elementary School', id: '062055000008' },
      { name: 'Fremont Elementary School', id: '062055000009' },
      { name: 'Garrison Elementary School', id: '062055000010' }
    ]
  },

  // Riverside/San Bernardino
  {
    id: '0629670',
    name: 'Riverside Unified School District',
    city: 'Riverside',
    county: 'Riverside',
    zip: '92501',
    schools: [
      { name: 'Adams Elementary School', id: '062967000001' },
      { name: 'Alcott Elementary School', id: '062967000002' },
      { name: 'Arlington Elementary School', id: '062967000003' },
      { name: 'Beatty Elementary School', id: '062967000004' },
      { name: 'Bryant Elementary School', id: '062967000005' },
      { name: 'Castle View Elementary School', id: '062967000006' },
      { name: 'Emerson Elementary School', id: '062967000007' },
      { name: 'Franklin Elementary School', id: '062967000008' },
      { name: 'Fremont Elementary School', id: '062967000009' },
      { name: 'Hawthorne Elementary School', id: '062967000010' }
    ]
  },
  {
    id: '0631500',
    name: 'San Bernardino City Unified School District',
    city: 'San Bernardino',
    county: 'San Bernardino',
    zip: '92410',
    schools: [
      { name: 'Alessandro Elementary School', id: '063150000001' },
      { name: 'Arrowhead Elementary School', id: '063150000002' },
      { name: 'Arrowview Elementary School', id: '063150000003' },
      { name: 'Barton Elementary School', id: '063150000004' },
      { name: 'Belvedere Elementary School', id: '063150000005' },
      { name: 'Cesar Chavez Elementary School', id: '063150000006' },
      { name: 'Cole Elementary School', id: '063150000007' },
      { name: 'Cypress Elementary School', id: '063150000008' },
      { name: 'Davidson Elementary School', id: '063150000009' },
      { name: 'Del Rosa Elementary School', id: '063150000010' }
    ]
  }
];

async function importCaliforniaData() {
  console.log('🚀 Starting California districts and elementary schools import...\n');

  let totalDistricts = 0;
  let totalSchools = 0;
  let errors = 0;

  for (const district of californiaDistricts) {
    console.log(`\n📚 Processing: ${district.name}`);

    // Insert district
    try {
      const { error } = await supabase
        .from('districts')
        .upsert({
          id: district.id,
          state_id: 'CA',
          name: district.name,
          city: district.city,
          county: district.county,
          zip: district.zip
        }, { onConflict: 'id' });

      if (error) throw error;

      totalDistricts++;
      console.log(`  ✅ District inserted`);
    } catch (error) {
      console.error(`  ❌ Error inserting district:`, error);
      errors++;
      continue;
    }

    // Insert schools for this district
    let schoolCount = 0;
    for (const school of district.schools) {
      try {
        const { error } = await supabase
          .from('schools')
          .upsert({
            id: school.id,
            district_id: district.id,
            name: school.name,
            school_type: 'Elementary',
            city: district.city,
            zip: district.zip
          }, { onConflict: 'id' });

        if (error) throw error;

        schoolCount++;
      } catch (error) {
        console.error(`    ❌ Error inserting school ${school.name}:`, error);
        errors++;
      }
    }

    totalSchools += schoolCount;
    console.log(`  ✅ ${schoolCount} elementary schools inserted`);
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Districts imported: ${totalDistricts}/${californiaDistricts.length}`);
  console.log(`✅ Elementary schools imported: ${totalSchools}`);

  if (errors > 0) {
    console.log(`⚠️  Errors encountered: ${errors}`);
  }

  // Verify in database
  const { count: districtCount } = await supabase
    .from('districts')
    .select('*', { count: 'exact', head: true })
    .eq('state_id', 'CA');

  const { count: schoolCount } = await supabase
    .from('schools')
    .select('*', { count: 'exact', head: true })
    .eq('school_type', 'Elementary');

  console.log(`\n📊 Database verification:`);
  console.log(`   Total CA districts in DB: ${districtCount}`);
  console.log(`   Total CA elementary schools in DB: ${schoolCount}`);
}

// Run the import
importCaliforniaData()
  .then(() => {
    console.log('\n✨ California schools import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Import failed:', error);
    process.exit(1);
  });