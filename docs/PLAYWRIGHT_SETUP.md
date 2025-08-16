# Playwright E2E Testing Setup

## Overview

This project uses Playwright for end-to-end testing. Tests are located in `tests/e2e/` and are automatically run in CI/CD pipelines.

## Local Development

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Install system dependencies (if needed)
npx playwright install-deps
```

### Running Tests

```bash
# Run all tests
npm run test:e2e

# Run tests in UI mode (interactive)
npm run test:e2e:watch

# Debug tests
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/user-flows/homepage.test.js

# Run tests in headed mode
npx playwright test --headed

# Run tests in specific browser
npx playwright test --project=chromium
```

### Writing Tests

Tests should follow this structure:

```javascript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/path');
    await expect(page.locator('selector')).toBeVisible();
  });
});
```

## CI/CD Integration

### GitHub Actions Workflows

We have two Playwright workflows:

1. **Main Workflow** (`playwright.yml`)
   - Runs on push to main and all PRs
   - Uses test sharding for parallel execution
   - Generates and deploys HTML reports
   - Uploads artifacts for debugging

2. **PR Workflow** (`playwright-pr.yml`)
   - Lightweight checks for pull requests
   - Only runs affected tests when possible
   - Posts results as PR comments

### Environment Variables

Required environment variables for CI:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for tests requiring admin access)
- `ANTHROPIC_API_KEY`
- `BASE_URL` (optional, defaults to http://localhost:3000)

### Setting up Secrets in GitHub

1. Go to Settings > Secrets and variables > Actions
2. Add the required environment variables as repository secrets
3. The workflows will automatically use these secrets

## Test Organization

```
tests/e2e/
├── user-flows/          # User journey tests
│   ├── auth-flow.test.js
│   ├── homepage.test.js
│   └── referral-code-display.test.ts
├── helpers/             # Test utilities
└── screenshots/         # Screenshot storage
```

## Configuration

The main configuration file is `playwright.config.js`:

- **Timeout**: 30 seconds per test
- **Retries**: 2 retries in CI, none locally
- **Browsers**: Chromium by default (can add Firefox, WebKit)
- **Reports**: HTML reports with screenshots/videos on failure
- **Parallel**: Tests run in parallel for speed

## Debugging Failed Tests

### Locally

```bash
# Run with trace viewer
npx playwright test --trace on

# Open last test trace
npx playwright show-trace

# Run specific test with debugging
npx playwright test --debug tests/e2e/user-flows/homepage.test.js
```

### In CI

1. Check the GitHub Actions run logs
2. Download artifacts from the Actions tab:
   - `playwright-report`: HTML report
   - `test-results`: Screenshots and videos
   - `blob-report-*`: Raw test data

## Best Practices

1. **Use Page Object Model** for complex pages
2. **Keep tests independent** - each test should be able to run alone
3. **Use data-testid attributes** for reliable selectors
4. **Mock external APIs** when possible for speed and reliability
5. **Use fixtures** for common setup/teardown
6. **Write descriptive test names** that explain what's being tested

## Troubleshooting

### Tests fail locally but pass in CI

- Check environment variables
- Ensure browsers are up to date: `npx playwright install`
- Clear test cache: `rm -rf test-results playwright-report`

### Tests are flaky

- Increase timeouts for slow operations
- Use `waitForLoadState('networkidle')` for dynamic content
- Add explicit waits: `await page.waitForSelector()`
- Check for race conditions in the application

### Cannot find elements

- Use Playwright Inspector: `npx playwright test --debug`
- Try different selectors: `page.locator()`, `page.getByRole()`, `page.getByText()`
- Check if element is in iframe or shadow DOM

## Migration from Jest

We recently migrated from Jest to Playwright (PR #103). Key changes:

- Removed `jest.e2e.config.js` and `jest.e2e.setup.js`
- Updated test syntax from Jest to Playwright
- Changed npm scripts to use Playwright commands
- Tests now skip when environment variables are missing

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Writing Tests](https://playwright.dev/docs/writing-tests)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [CI/CD Guide](https://playwright.dev/docs/ci)
