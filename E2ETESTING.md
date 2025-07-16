```markdown
# E2E Testing Infrastructure Documentation

## Overview

This project implements an AI-powered end-to-end (E2E) testing system using Puppeteer for browser automation and Anthropic's Claude API for intelligent test generation and validation. The system includes automated testing, continuous monitoring, and pre-deployment checks.

## Architecture

```
tests/e2e/
├── helpers/
│   └── ai-test-helper.js        # AI-powered test utilities
├── user-flows/
│   └── auth-flow.test.js        # Example test suite
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
SUPABASE_SERVICE_KEY=your_supabase_service_key
BASE_URL=http://localhost:3000  # or your deployment URL
```

### 2. Installation

All dependencies should already be installed, but if needed:

```bash
npm install puppeteer @anthropic-ai/sdk node-cron nodemailer recharts
```

### 3. Configuration Files

#### `.puppeteerrc.json`
```json
{
  "args": [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--single-process",
    "--disable-gpu"
  ]
}
```

#### `jest.e2e.config.js`
Separate Jest configuration for E2E tests with 30-second timeout and Node environment.

## Available Scripts

### Testing Commands

```bash
# Run E2E tests once
npm run test:e2e

# Run E2E tests in watch mode
npm run test:e2e:watch

# Run AI-powered test suite with reporting
npm run test:e2e:ai

# Debug mode - runs with visible browser
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

### 1. AI Test Helper (`ai-test-helper.js`)

The AI Test Helper provides intelligent testing capabilities:

```javascript
const aiHelper = new AITestHelper(page);

// Analyze page and suggest tests
const analysis = await aiHelper.analyzePageContent();

// Generate test data for forms
const testData = await aiHelper.generateTestData('form#login');

// Find elements with self-healing selectors
const element = await aiHelper.findElement('login button', [
  'button[type="submit"]',
  'button.login-btn'
]);

// Validate user flows
const validation = await aiHelper.validateUserFlow(
  'User login flow',
  'Should redirect to dashboard'
);
```

### 2. Writing E2E Tests

Example test structure:

```javascript
describe('Feature Tests', () => {
  let browser, page, aiHelper;

  beforeEach(async () => {
    browser = global.__BROWSER__;
    page = await browser.newPage();
    aiHelper = new AITestHelper(page);
  });

  test('critical user path', async () => {
    await page.goto(`${BASE_URL}/login`);

    // Let AI generate test data
    const credentials = await aiHelper.generateTestData('form');

    // Fill and submit
    await page.type('input[type="email"]', credentials.email);
    await page.type('input[type="password"]', credentials.password);
    await page.click('button[type="submit"]');

    // AI validates the result
    const result = await aiHelper.validateUserFlow(
      'Login flow',
      'User should see dashboard'
    );

    expect(result.success).toBe(true);
  });
});
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

## Troubleshooting

### Common Issues

1. **Puppeteer fails to start**
   - Ensure `.puppeteerrc.json` exists with Replit-compatible args
   - Check that Chrome dependencies are installed

2. **Tests timeout**
   - Increase timeout in `jest.e2e.config.js`
   - Check if app is running on expected port

3. **AI responses fail to parse**
   - Claude returns text, not JSON - use `JSON.parse(message.content[0].text)`
   - Add error handling for malformed responses

4. **Screenshots not saving**
   - Create directories: `mkdir -p tests/e2e/screenshots tests/e2e/reports`

### Debug Mode

Run tests with visible browser:
```bash
HEADLESS=false npm run test:e2e:debug
```

### Viewing Logs

Test execution logs are saved to:
- `tests/e2e/reports/last-run.json`
- `deployment-check-results.json`

## Best Practices

1. **Test Organization**
   - Group related tests in describe blocks
   - Use descriptive test names
   - Clean up resources in afterEach

2. **AI Usage**
   - Cache AI responses when possible
   - Use specific prompts for better results
   - Always validate AI-generated data

3. **Performance**
   - Reuse browser instances
   - Parallelize independent tests
   - Set appropriate timeouts

4. **Monitoring**
   - Review AI insights daily
   - Adjust alert thresholds based on app stability
   - Archive old test results periodically

## Deployment Integration

### Replit Deployment

1. Ensure `.replit` file has correct deployment configuration
2. Run pre-deployment checks: `npm run test:e2e:ci`
3. Deploy using Replit's Deploy button
4. Monitor post-deployment: `npm run monitor:start`

### CI/CD Integration

For GitHub Actions or other CI/CD:
```yaml
- name: Run E2E Tests
  run: |
    npm run build
    npm run start &
    sleep 10
    npm run test:e2e:ci
```

## Extending the System

### Adding New Test Flows

1. Create new test file in `tests/e2e/user-flows/`
2. Import and use AITestHelper
3. Follow existing patterns for consistency

### Custom AI Validations

Extend `AITestHelper` class:
```javascript
async validateCustomFlow(customData) {
  const message = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Custom validation prompt: ${customData}`
    }]
  });

  return JSON.parse(message.content[0].text);
}
```

### Adding Metrics

Update `collectPerformanceMetrics()` in monitoring system to track additional metrics.

## Support

For issues or questions:
1. Check test logs in `tests/e2e/reports/`
2. Review AI insights in the monitoring dashboard
3. Run tests in debug mode for visual debugging
4. Ensure all environment variables are set correctly
```

This README provides comprehensive documentation for your E2E testing setup that Claude Code can reference when helping with issues or extending the system.