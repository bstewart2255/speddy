import { createClient } from '@/lib/supabase/server';

async function checkAnalyticsTable() {
  const supabase = await createClient();
  
  console.log('Checking if analytics_events table exists...\n');
  
  // Try to query the table
  const { data, error } = await supabase
    .from('analytics_events')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('❌ Table does not exist or error accessing it:');
    console.error(error.message);
    console.log('\nTo fix this, run the migration:');
    console.log('supabase db push');
    console.log('or');
    console.log('supabase migration up');
    return false;
  }
  
  console.log('✅ Table exists!');
  
  // Check if there's any data
  const { count } = await supabase
    .from('analytics_events')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Records in table: ${count || 0}`);
  
  return true;
}

// Run the check
checkAnalyticsTable()
  .then(exists => process.exit(exists ? 0 : 1))
  .catch(error => {
    console.error('Script error:', error);
    process.exit(1);
  });