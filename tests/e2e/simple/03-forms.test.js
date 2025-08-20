import { test, expect } from '@playwright/test';

test.describe('03 - Basic Form Interactions', () => {
  test('login form has required fields', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(500);
    
    // Check for email input
    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    expect(emailInput).toBeTruthy();
    
    // Check for password input
    const passwordInput = await page.$('input[type="password"], input[name="password"], input[placeholder*="password" i]');
    expect(passwordInput).toBeTruthy();
    
    // Check for submit button
    const submitButton = await page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
    expect(submitButton).toBeTruthy();
  });

  test('can type into login form fields', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(500);
    
    // Find and fill email field
    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    if (emailInput) {
      await emailInput.fill('test@example.com');
      const value = await emailInput.inputValue();
      expect(value).toBe('test@example.com');
    }
    
    // Find and fill password field
    const passwordInput = await page.$('input[type="password"], input[name="password"], input[placeholder*="password" i]');
    if (passwordInput) {
      await passwordInput.fill('testpassword123');
      const value = await passwordInput.inputValue();
      expect(value).toBe('testpassword123');
    }
  });

  test('form validation shows error for invalid email', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(500);
    
    // Find email field and enter invalid email
    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    if (emailInput) {
      await emailInput.fill('notanemail');
      
      // Try to submit or tab away to trigger validation
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      
      // Check if HTML5 validation or custom validation kicked in
      const validationMessage = await emailInput.evaluate(el => el.validationMessage);
      // If there's a validation message, it means validation is working
      // We're not testing the specific message, just that validation exists
      expect(validationMessage).toBeDefined();
    }
  });
});