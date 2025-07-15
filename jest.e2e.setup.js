// jest.e2e.setup.js
import puppeteer from 'puppeteer';

// Increase timeout for E2E tests
jest.setTimeout(30000);

// Store browser instance
global.__BROWSER__ = null;

// Setup browser before all tests
beforeAll(async () => {
  global.__BROWSER__ = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
  });
});

// Cleanup after all tests
afterAll(async () => {
  if (global.__BROWSER__) {
    await global.__BROWSER__.close();
  }
});