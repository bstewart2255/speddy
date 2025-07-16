// tests/integration/key-check.test.js
import { createClient } from '@supabase/supabase-js';

describe('API Key Check', () => {
  test('verify service key role', () => {
    const key = process.env.SUPABASE_SERVICE_KEY;

    const parts = key.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    console.log('Key role:', payload.role);
    console.log('Key exp:', new Date(payload.exp * 1000).toISOString());
    console.log('Key length:', key.length);

    expect(payload.role).toBe('service_role');
  });

  test('service key bypasses RLS', async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const testId = `test-${Date.now()}`;

    // Insert
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: testId,
        email: 'test@example.com',
        role: 'provider',
        full_name: 'Test User'
      })
      .select()
      .single();

    console.log('Insert result:', { data, error });

    // Clean up - don't wait too long
    if (data || !error) {
      supabase.from('profiles').delete().eq('id', testId).then(() => {
        console.log('Cleanup completed');
      }).catch(() => {
        console.log('Cleanup failed, but test passed');
      });
    }

    // Service key should bypass RLS
    expect(error).toBeNull();
    console.log('✅ Service key works! Test passed.');
  }, 10000); // Shorter timeout
});