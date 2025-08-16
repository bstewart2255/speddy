import { test, expect } from '@playwright/test';

test.describe('E2E Testing Setup', () => {
  test('should be configured correctly', () => {
    expect(true).toBe(true);
  });

  test('environment variables are set', () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeDefined();
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
  });
});