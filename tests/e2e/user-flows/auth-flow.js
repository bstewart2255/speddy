// tests/e2e/user-flows/auth-flow.test.js
import puppeteer from 'puppeteer';
import { AITestHelper } from '../helpers/ai-test-helper';

describe('AI-Powered Authentication Flow Tests', () => {
  let browser;
  let page;
  let aiHelper;

  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  beforeEach(async () => {
    browser = global.__BROWSER__;
    page = await browser.newPage();
    aiHelper = new AITestHelper(page);

    // Set viewport for consistent screenshots
    await page.setViewport({ width: 1280, height: 720 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  test('AI validates complete login flow', async () => {
    // Navigate to login page
    await page.goto(`${BASE_URL}/login`);

    // Let AI analyze the page and suggest what to test
    const pageAnalysis = await aiHelper.analyzePageContent();
    console.log('AI Analysis:', pageAnalysis);

    // Find login form using AI-powered selector healing
    const loginForm = await aiHelper.findElement('login form', [
      'form[data-testid="login-form"]',
      'form#loginForm',
      'form.login-form',
      'form[action*="login"]'
    ]);

    // Generate test credentials
    const testData = await aiHelper.generateTestData(loginForm.selector);
    console.log('AI Generated Test Data:', testData);

    // Fill in the form
    if (testData.email) {
      await page.type('input[type="email"]', testData.email);
    }
    if (testData.password) {
      await page.type('input[type="password"]', testData.password);
    }

    // Take screenshot before submission
    await page.screenshot({ path: 'tests/e2e/screenshots/before-login.png' });

    // Submit form
    const submitButton = await aiHelper.findElement('submit button', [
      'button[type="submit"]',
      'button[data-testid="submit-login"]',
      'button:contains("Log in")',
      'button:contains("Sign in")'
    ]);

    await submitButton.element.click();

    // Wait for navigation or response
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {
      // Sometimes login might not navigate, just show errors
    });

    // Let AI validate the result
    const validation = await aiHelper.validateUserFlow(
      'User login with valid credentials',
      'User should be redirected to dashboard or home page with authenticated state'
    );

    console.log('AI Validation Result:', validation);

    // Assert based on AI validation
    expect(validation.success).toBe(true);

    if (!validation.success) {
      console.log('AI Suggestions:', validation.suggestions);
      // Take failure screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/login-failure.png' });
    }
  });

  test('AI detects and reports accessibility issues', async () => {
    await page.goto(`${BASE_URL}/login`);

    // Run accessibility audit
    const accessibilityReport = await page.evaluate(() => {
      const issues = [];

      // Check for missing alt texts
      document.querySelectorAll('img:not([alt])').forEach(img => {
        issues.push({
          type: 'missing-alt',
          element: img.outerHTML.substring(0, 100)
        });
      });

      // Check for missing labels
      document.querySelectorAll('input:not([aria-label]):not([id])').forEach(input => {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (!label) {
          issues.push({
            type: 'missing-label',
            element: input.outerHTML
          });
        }
      });

      return issues;
    });

    // Let AI analyze accessibility issues
    if (accessibilityReport.length > 0) {
      const aiAnalysis = await aiHelper.validateUserFlow(
        'Accessibility check for login page',
        'Page should have no critical accessibility issues'
      );

      console.log('Accessibility Issues Found:', accessibilityReport);
      console.log('AI Recommendations:', aiAnalysis.suggestions);
    }

    expect(accessibilityReport.length).toBe(0);
  });

  test('AI monitors performance during user flow', async () => {
    // Start performance monitoring
    await page.evaluateOnNewDocument(() => {
      window.performanceMetrics = [];

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.performanceMetrics.push({
            name: entry.name,
            duration: entry.duration,
            type: entry.entryType
          });
        }
      });

      observer.observe({ entryTypes: ['navigation', 'resource', 'measure'] });
    });

    await page.goto(`${BASE_URL}`);

    // Simulate user interactions
    const navLinks = await page.$$('nav a');
    for (const link of navLinks.slice(0, 3)) { // Test first 3 nav links
      await link.click();
      await page.waitForTimeout(1000); // Wait for page to settle
    }

    // Collect performance metrics
    const metrics = await page.evaluate(() => window.performanceMetrics);

    // Let AI analyze performance
    const performanceAnalysis = await aiHelper.validateUserFlow(
      'Multi-page navigation performance test',
      'All pages should load within 3 seconds with no major performance issues'
    );

    console.log('Performance Metrics:', metrics);
    console.log('AI Performance Analysis:', performanceAnalysis);

    // Check if any resource took too long
    const slowResources = metrics.filter(m => m.duration > 3000);
    expect(slowResources.length).toBe(0);
  });
});