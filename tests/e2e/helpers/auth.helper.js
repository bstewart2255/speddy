import { expect } from '@playwright/test';
import { createUserAndProfile, loginUser, testUsers, seedActiveSubscriptionForUser, cleanupTestUser } from './test-user-creator.js';

// Global test user (created once per test file)
let globalTestUser = null;

/**
 * Helper function to authenticate using real credentials
 * This creates an actual Supabase user and logs in through the UI
 */
export async function authenticateUser(page) {
  // Create test user if not exists
  if (!globalTestUser) {
    globalTestUser = testUsers.teacher;
    const userId = await createUserAndProfile(globalTestUser);
    // Seed active subscription so login doesn't redirect to payment
    await seedActiveSubscriptionForUser(userId);
  }
  
  await loginUser(page, globalTestUser);
}

/**
 * Helper to set up authenticated state before navigating
 * Now uses real authentication instead of bypass
 */
export async function authenticatedGoto(page, url) {
  await authenticateUser(page);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  
  // Verify we're not on login page
  if (page.url().includes('/login')) {
    throw new Error(`Authentication failed: redirected to login page after navigating to ${url}`);
  }
}

/**
 * Legacy bypass authentication function (kept for backward compatibility)
 * @deprecated Use authenticateUser() with real credentials instead
 */
export async function authenticateUserBypass(page) {
  console.warn('Using deprecated auth bypass - consider switching to real authentication');
  
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
 * Cleanup function to be called after test suites
 * Should be used in test.afterAll() or similar
 */
export async function cleanupAuthenticatedUser() {
  if (globalTestUser) {
    await cleanupTestUser(globalTestUser.email);
    globalTestUser = null;
  }
}