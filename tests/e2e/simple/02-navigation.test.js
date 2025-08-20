import { test, expect } from '@playwright/test';

test.describe('02 - Basic Navigation', () => {
  test('login page exists and loads', async ({ page }) => {
    await page.goto('/login');
    
    // Should not redirect away from login
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/login');
    
    // Should have some login-related content
    const loginIndicators = await page.$$eval('*', elements => 
      elements.some(el => 
        el.textContent?.toLowerCase().includes('login') ||
        el.textContent?.toLowerCase().includes('sign in') ||
        el.textContent?.toLowerCase().includes('email') ||
        el.textContent?.toLowerCase().includes('password')
      )
    );
    
    expect(loginIndicators).toBeTruthy();
  });

  test('can navigate to signup page', async ({ page }) => {
    await page.goto('/signup');
    
    // Should not redirect away from signup
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/signup');
    
    // Should have some signup-related content
    const signupIndicators = await page.$$eval('*', elements => 
      elements.some(el => 
        el.textContent?.toLowerCase().includes('sign up') ||
        el.textContent?.toLowerCase().includes('create account') ||
        el.textContent?.toLowerCase().includes('register')
      )
    );
    
    expect(signupIndicators).toBeTruthy();
  });

  test('unauthenticated user redirects to login from protected route', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should redirect to login
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/login');
  });
});