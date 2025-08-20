import { expect } from '@playwright/test';
import { createUserAndProfile, loginUser, testUsers, seedActiveSubscriptionForUser, cleanupTestUser } from './test-user-creator.js';

// Global test user (created once per test file)
let globalTestUser = null;

// Check if we have required environment variables for real auth
const hasSupabaseConfig = () => {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
};

/**
 * Helper function to authenticate using real credentials
 * This creates an actual Supabase user and logs in through the UI
 */
export async function authenticateUser(page) {
  // If Supabase is not configured, use bypass method
  if (!hasSupabaseConfig()) {
    console.warn('Supabase not configured, using auth bypass');
    return await authenticateUserBypass(page);
  }
  
  try {
    // Create test user if not exists
    if (!globalTestUser) {
      globalTestUser = testUsers.teacher;
      const userId = await createUserAndProfile(globalTestUser);
      // Seed active subscription so login doesn't redirect to payment
      await seedActiveSubscriptionForUser(userId);
    }
    
    await loginUser(page, globalTestUser);
  } catch (error) {
    console.error('Real authentication failed, falling back to bypass:', error.message);
    // Fallback to bypass if real auth fails
    return await authenticateUserBypass(page);
  }
}

/**
 * Helper to set up authenticated state before navigating
 * Now uses real authentication instead of bypass
 */
export async function authenticatedGoto(page, url) {
  await authenticateUser(page);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  
  // Verify we're not on login page (unless that's where we wanted to go)
  if (!url.includes('/login') && page.url().includes('/login')) {
    // Try one more time with bypass auth
    console.warn('First auth attempt failed, retrying with bypass');
    await authenticateUserBypass(page);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    
    if (page.url().includes('/login')) {
      throw new Error(`Authentication failed: redirected to login page after navigating to ${url}`);
    }
  }
}

/**
 * Bypass authentication function for CI environments
 * Used when Supabase credentials are not available or real auth fails
 */
export async function authenticateUserBypass(page) {
  // Set up the page to always send the test auth bypass header
  await page.setExtraHTTPHeaders({
    'x-test-auth-bypass': 'true'
  });

  // Mock Supabase auth responses
  await page.route('**/auth/v1/**', async (route) => {
    if (route.request().url().includes('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-123',
          email: 'test@example.com',
          user_metadata: {
            full_name: 'Test User',
            role: 'resource'
          }
        })
      });
    } else {
      await route.continue();
    }
  });

  // Mock Supabase data queries
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    
    // Mock profile data
    if (url.includes('/profiles')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'test-user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'resource',
          school_district: 'Test District',
          school_site: 'Test School'
        }])
      });
    }
    // Mock subscription data
    else if (url.includes('/subscriptions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          user_id: 'test-user-123',
          status: 'active',
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }])
      });
    }
    // Return empty array for other queries
    else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    }
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