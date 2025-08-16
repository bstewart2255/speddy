import { test, expect } from '@playwright/test';

test.describe('Homepage E2E Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('homepage has expected content', async ({ page }) => {
    await page.goto('/');
    // Adjust this selector based on your actual homepage
    const heading = await page.textContent('h1');
    expect(heading).toBeTruthy();
  });
});