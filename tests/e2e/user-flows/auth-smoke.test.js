import { test, expect } from '@playwright/test';
import { authenticatedGoto } from '../helpers/auth.helper.js';

test.describe('Authentication Smoke Test', () => {
  test('can authenticate and access dashboard', async ({ page }) => {
    // This test verifies that authentication (real or bypass) is working
    await authenticatedGoto(page, '/dashboard');
    
    // Should not be on login page
    expect(page.url()).not.toContain('/login');
    
    // Should be on dashboard
    expect(page.url()).toContain('/dashboard');
    
    // Dashboard should have some expected content
    // Using a more flexible check that works with various dashboard states
    const dashboardIndicators = [
      page.locator('text=/dashboard/i'),
      page.locator('[data-testid="dashboard"]'),
      page.locator('nav'),
      page.locator('main')
    ];
    
    // At least one indicator should be visible
    let foundIndicator = false;
    for (const indicator of dashboardIndicators) {
      const count = await indicator.count();
      if (count > 0) {
        foundIndicator = true;
        break;
      }
    }
    
    expect(foundIndicator).toBeTruthy();
  });
  
  test('auth bypass header is set in CI', async ({ page }) => {
    // Only run this test in CI
    test.skip(process.env.CI !== 'true', 'This test only runs in CI');
    
    // Set up request interception to check headers
    let bypassHeaderFound = false;
    page.on('request', request => {
      if (request.headers()['x-test-auth-bypass'] === 'true') {
        bypassHeaderFound = true;
      }
    });
    
    await authenticatedGoto(page, '/dashboard');
    
    // In CI with auth bypass enabled, the header should be present
    if (process.env.ENABLE_TEST_AUTH_BYPASS === 'true') {
      expect(bypassHeaderFound).toBeTruthy();
    }
  });
});