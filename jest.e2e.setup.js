// jest.e2e.setup.js
const { chromium } = require('playwright');

// Increase timeout for E2E tests
jest.setTimeout(30000);

// Store browser instance
global.__BROWSER__ = null;

// Setup browser before all tests
beforeAll(async () => {
  global.__BROWSER__ = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
  });
});

// Cleanup after all tests
afterAll(async () => {
  if (global.__BROWSER__) {
    await global.__BROWSER__.close();
  }
});