// tests/integration/debug.test.js
import { createClient } from '@supabase/supabase-js';

describe('Debug Supabase', () => {
  test('check environment variables', () => {
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('Service Key exists:', !!process.env.SUPABASE_SERVICE_KEY);
    console.log('Service Key length:', process.env.SUPABASE_SERVICE_KEY?.length);
  });

  test('create client and check admin', () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    console.log('Client created:', !!client);
    console.log('Client auth:', !!client.auth);
    console.log('Client auth.admin:', !!client.auth.admin);

    // Try to list users to verify admin access
    if (client.auth.admin) {
      console.log('Admin methods available:', Object.keys(client.auth.admin));
    }
  });
});