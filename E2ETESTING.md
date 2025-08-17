# E2E Testing Infrastructure Documentation

## Overview

This project implements an AI-powered end-to-end (E2E) testing system using Playwright for browser automation and Anthropic's Claude API for intelligent test generation and validation. The system includes automated testing, continuous monitoring, and pre-deployment checks.

## Architecture

```
tests/e2e/
├── helpers/
│   └── ai-test-helper.js        # AI-powered test utilities
├── user-flows/
│   ├── auth-flow.test.js        # Authentication tests
│   ├── basic.test.js            # Basic configuration tests
│   ├── homepage.test.js         # Homepage tests
│   ├── kindergarten-schedule.test.js  # Schedule tests
│   └── referral-code-display.test.ts  # Referral code tests
├── runner/
│   └── test-runner.js           # Test execution orchestrator
├── monitor/
│   └── continuous-monitor.js    # Automated monitoring system
├── deployment/
│   ├── pre-deploy-check.js      # Deployment validation
│   └── replit-deploy-check.js   # Replit-specific checks
├── screenshots/                  # Test failure screenshots
└── reports/                      # Test execution reports
```

## Setup Instructions

### 1. Environment Variables

Add these to Replit Secrets (or `.env.local`):

```bash
ANTHROPIC_API_KEY=your_claude_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
BASE_URL=http://localhost:3000  # or your deployment URL
```

### 2. Installation

Install dependencies and Playwright browsers:

```bash
npm install
npx playwright install --with-deps chromium
```

### 3. Configuration Files

#### `playwright.config.js`

Main Playwright configuration with:

- Test directory: `./tests/e2e`
- Timeout: 30 seconds
- Parallel execution
- Multiple reporters (HTML, JSON, blob)
- Web server auto-start for local development

## Available Scripts

### Testing Commands

```bash
# Run E2E tests with Playwright
npm run test:e2e

# Run E2E tests in UI mode (interactive)
npm run test:e2e:watch

# Run AI-powered test suite with reporting
npm run test:e2e:ai

# Debug mode - runs with browser UI
npm run test:e2e:debug

# Pre-deployment checks
npm run test:e2e:ci
```

### Monitoring Commands

```bash
# Start continuous monitoring (runs tests hourly)
npm run monitor:start

# Deploy with checks (Replit)
npm run deploy:replit
```

## Core Features

### 1. Writing Playwright Tests

Example test structure:

```javascript
import { test, expect } from '@playwright/test';

test.describe('Feature Tests', () => {
  test('critical user path', async ({ page }) => {
    await page.goto('/login');

    // Fill form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');

    // Verify navigation
    await expect(page).toHaveURL(/\/dashboard/);

    // Check for elements
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});
```

### 2. AI Test Helper Integration

The AI Test Helper can be used with Playwright for intelligent testing:

```javascript
const aiHelper = new AITestHelper(page);

// Analyze page and suggest tests
const analysis = await aiHelper.analyzePageContent();

// Generate test data for forms
const testData = await aiHelper.generateTestData('form#login');

// Find elements with self-healing selectors
const element = await aiHelper.findElement('login button', [
  'button[type="submit"]',
  'button.login-btn',
]);

// Validate user flows
const validation = await aiHelper.validateUserFlow(
  'User login flow',
  'Should redirect to dashboard'
);
```

### 3. Continuous Monitoring

The monitoring system runs automatically and:

- Executes tests every hour
- Stores results in Supabase
- Sends alerts after 3 consecutive failures
- Detects performance degradation (>50% slower)
- Generates daily reports

### 4. Monitoring Dashboard

Access at `/admin/e2e-dashboard` to view:

- Real-time test status
- Success rate trends
- Performance metrics
- AI-generated insights
- Historical test results

## Database Schema

### `e2e_test_results` table

```sql
CREATE TABLE e2e_test_results (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP,
  success BOOLEAN,
  duration INTEGER,
  test_count INTEGER,
  failed_tests JSONB,
  performance_metrics JSONB,
  ai_insights TEXT,
  screenshots JSONB,
  error_logs TEXT
);
```

## Migration from Jest to Playwright

We've recently migrated from Jest to Playwright for E2E testing. Key changes:

1. **Removed Files:**
   - `jest.e2e.config.js`
   - `jest.e2e.setup.js`
   - Old Puppeteer-based tests

2. **Updated Syntax:**
   - `describe` → `test.describe`
   - `it/test` → `test`
   - Jest matchers → Playwright assertions

3. **New Features:**
   - Auto-waiting for elements
   - Built-in test retry
   - Parallel test execution
   - Better debugging tools

## Troubleshooting

### Common Issues

1. **Playwright browsers not installed**

   ```bash
   npx playwright install --with-deps
   ```

2. **Tests timeout**
   - Increase timeout in `playwright.config.js`
   - Check if app is running on expected port
   - Use `await expect(element).toBeVisible()` for auto-waiting

3. **Environment variables missing**
   - Tests will skip when required env vars are not set
   - Check your `.env.local` or Replit Secrets

4. **Screenshots not saving**
   - Create directories: `mkdir -p tests/e2e/screenshots tests/e2e/reports`

### Debug Mode

Run tests with visible browser:

```bash
npx playwright test --headed
# or
npm run test:e2e:debug
```

Use Playwright Inspector:

```bash
npx playwright test --debug
```

### Viewing Test Reports

```bash
# Open HTML report
npx playwright show-report

# View trace files
npx playwright show-trace trace.zip
```

## Best Practices

1. **Test Organization**
   - Group related tests in describe blocks
   - Use descriptive test names
   - Use Page Object Model for complex pages

2. **Playwright Specific**
   - Use `data-testid` attributes for reliable selectors
   - Prefer `getByRole`, `getByText` over CSS selectors
   - Use `expect` with auto-waiting assertions
   - Configure tests to run in serial mode when needed

3. **Performance**
   - Use test.describe.configure({ mode: 'parallel' }) for independent tests
   - Use test.describe.configure({ mode: 'serial' }) for dependent tests
   - Set appropriate timeouts

4. **CI/CD**
   - Use GitHub Actions workflows for automated testing
   - Configure test sharding for faster execution
   - Upload artifacts for debugging failures

## GitHub Actions Integration

We have two Playwright workflows:

1. **Main Workflow** (`playwright.yml`)
   - Runs on push to main and all PRs
   - Uses test sharding for parallel execution
   - Generates HTML reports
   - Uploads test artifacts

2. **PR Workflow** (`playwright-pr.yml`)
   - Lightweight checks for pull requests
   - Only runs affected tests when possible
   - Posts results as PR comments

## Extending the System

### Adding New Test Flows

1. Create new test file in `tests/e2e/user-flows/`
2. Use Playwright test structure
3. Follow existing patterns for consistency

### Custom Test Helpers

Create reusable functions:

```javascript
export async function loginUser(page, email, password) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}
```

## Support

For issues or questions:

1. Check test logs in `playwright-report/`
2. Review trace files for failed tests
3. Run tests in debug mode for visual debugging
4. Ensure all environment variables are set correctly
5. Check the [Playwright documentation](https://playwright.dev)
