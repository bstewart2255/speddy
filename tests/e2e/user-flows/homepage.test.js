import { test, expect } from '@playwright/test';

test.describe('Homepage E2E Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('homepage redirects to login', async ({ page }) => {
    await page.goto('/');
    // Homepage redirects to /login
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });
});