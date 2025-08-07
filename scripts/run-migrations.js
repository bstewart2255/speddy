const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  
  // Define the migrations to run in order
  const migrations = [
    '20250807_create_teachers_table.sql',
    '20250807_add_teacher_id_to_students.sql',
    '20250807_migrate_teacher_data.sql'
  ];

  console.log('Starting database migrations...\n');

  for (const migrationFile of migrations) {
    const filePath = path.join(migrationsDir, migrationFile);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Migration file not found: ${migrationFile}`);
      continue;
    }

    console.log(`Running migration: ${migrationFile}`);
    
    try {
      const sql = fs.readFileSync(filePath, 'utf8');
      
      // Split by semicolons but preserve those within strings
      const statements = sql
        .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        // Skip empty statements and comments
        if (!statement || statement.startsWith('--')) continue;
        
        try {
          const { data, error } = await supabase.rpc('exec_sql', {
            sql: statement + ';'
          }).single();

          if (error) {
            // Try direct query if RPC doesn't exist
            console.log('  RPC not available, using alternate method...');
            // For now, we'll log the SQL that needs to be run manually
            console.log('  SQL to run manually:');
            console.log('  ', statement.substring(0, 100) + '...');
          } else {
            console.log('  ✓ Statement executed successfully');
          }
        } catch (err) {
          console.log('  ⚠️  Could not execute statement directly');
        }
      }
      
      console.log(`✅ Migration ${migrationFile} processed\n`);
    } catch (error) {
      console.error(`❌ Error in migration ${migrationFile}:`, error.message);
    }
  }

  console.log('\n🎉 Migration process completed!');
  console.log('\nIMPORTANT: Since we cannot directly execute SQL through the Supabase client,');
  console.log('please run these migrations manually in the Supabase SQL Editor:');
  console.log('1. Go to https://supabase.com/dashboard/project/qkcruccytmmdajfavpgb/sql/new');
  console.log('2. Copy and paste each migration file content from supabase/migrations/');
  console.log('3. Run them in this order:');
  migrations.forEach((m, i) => {
    console.log(`   ${i + 1}. ${m}`);
  });
}

runMigrations().catch(console.error);