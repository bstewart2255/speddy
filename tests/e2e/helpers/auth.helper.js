import { expect } from '@playwright/test';

/**
 * Helper function to authenticate a user for tests
 * This can be implemented in different ways:
 * 1. Mock authentication by setting cookies/localStorage
 * 2. Perform actual login through the UI
 * 3. Use API to get auth tokens
 */
export async function authenticateUser(page) {
  // Option 1: Mock authentication (fastest for tests)
  // Set up mock session/cookies that the app recognizes
  await page.addInitScript(() => {
    // Set mock auth data in localStorage or sessionStorage
    localStorage.setItem('supabase.auth.token', JSON.stringify({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Date.now() + 3600000, // 1 hour from now
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'authenticated'
      }
    }));
  });

  // Option 2: If the app requires actual Supabase auth, use test credentials
  // Uncomment and modify based on your auth setup:
  /*
  await page.goto('/login');
  await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD || 'testpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard/**');
  */
}

/**
 * Helper to set up authenticated state before navigating
 */
export async function authenticatedGoto(page, url) {
  await authenticateUser(page);
  await page.goto(url);
  // Wait for navigation to complete
  await page.waitForLoadState('networkidle');
}