import { test, expect } from '@playwright/test';

test.describe('01 - Basic App Loading', () => {
  test('app responds with HTTP 200', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

  test('app has a title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('app renders without JavaScript errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    
    await page.goto('/');
    await page.waitForTimeout(1000); // Give it a second to load
    
    expect(errors).toHaveLength(0);
  });

  test('app has basic HTML structure', async ({ page }) => {
    await page.goto('/');
    
    // Check for basic HTML elements
    const html = await page.$('html');
    const body = await page.$('body');
    const main = await page.$('main, #__next, #root, .app, [role="main"]');
    
    expect(html).toBeTruthy();
    expect(body).toBeTruthy();
    expect(main).toBeTruthy();
  });
});