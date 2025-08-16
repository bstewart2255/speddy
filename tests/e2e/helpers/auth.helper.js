import { expect } from '@playwright/test';

/**
 * Helper function to bypass authentication for tests
 * Uses a special header that the middleware recognizes to bypass auth checks
 */
export async function authenticateUser(page) {
  // Set up the page to always send the test auth bypass header
  await page.setExtraHTTPHeaders({
    'x-test-auth-bypass': 'true'
  });

  // Mock any Supabase data queries that might be made
  await page.route('**/rest/v1/**', async (route) => {
    // Return empty data for most queries
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });
}

/**
 * Helper to set up authenticated state before navigating
 */
export async function authenticatedGoto(page, url) {
  await authenticateUser(page);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}