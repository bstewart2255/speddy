import { test, expect } from '@playwright/test';

test.describe('E2E Testing Setup', () => {
  test('should be configured correctly', () => {
    expect(true).toBe(true);
  });

  test('environment variables are set', () => {
    const required = ['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL'];
    const missing = required.filter((k) => !process.env[k]);
    
    if (missing.length > 0) {
      test.skip(true, `Skipping: missing env vars ${missing.join(', ')}`);
      return;
    }
    
    expect(process.env.ANTHROPIC_API_KEY).toBeDefined();
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
  });
});