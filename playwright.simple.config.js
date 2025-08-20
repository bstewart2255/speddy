import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/simple',
  timeout: 15000, // Reduced timeout for simple tests
  fullyParallel: false, // Run sequentially for now
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for simple tests
  workers: 1, // Single worker for predictability
  
  reporter: [['list'], ['html', { open: 'never' }]],
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
  
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
  ],
  
  outputDir: 'test-results-simple/',
  
  // Web server configuration
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60 * 1000,
  },
});