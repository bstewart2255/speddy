// tests/e2e/runner/test-runner.js
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export class AITestRunner {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  async runTests() {
    console.log('🤖 Starting AI-Powered E2E Tests...\n');

    // Ensure directories exist
    await this.setupDirectories();

    // Start Next.js dev server if not running
    const serverProcess = await this.startDevServer();

    try {
      // Run the tests
      await this.executeTests();

      // Generate AI report
      await this.generateAIReport();

      // Check for flaky tests
      await this.detectFlakyTests();

    } finally {
      // Cleanup
      if (serverProcess) {
        serverProcess.kill();
      }
    }
  }

  async setupDirectories() {
    const dirs = [
      'tests/e2e/screenshots',
      'tests/e2e/reports',
      'tests/e2e/videos'
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async startDevServer() {
    // Check if server is already running
    try {
      const response = await fetch('http://localhost:3000');
      if (response.ok) {
        console.log('✅ Dev server already running\n');
        return null;
      }
    } catch (e) {
      // Server not running, start it
      console.log('🚀 Starting Next.js dev server...');
      const server = spawn('npm', ['run', 'dev'], {
        detached: true,
        stdio: 'pipe'
      });

      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.log('✅ Dev server started\n');

      return server;
    }
  }

  async executeTests() {
    return new Promise((resolve, reject) => {
      const testProcess = spawn('npm', ['run', 'test:e2e'], {
        stdio: 'pipe',
        env: { ...process.env, CI: 'true' }
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(data);
      });

      testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(data);
      });

      testProcess.on('close', async (code) => {
        this.results = {
          success: code === 0,
          output,
          errorOutput,
          duration: Date.now() - this.startTime
        };

        // Save raw results
        await fs.writeFile(
          'tests/e2e/reports/last-run.json',
          JSON.stringify(this.results, null, 2)
        );

        resolve();
      });
    });
  }

  async generateAIReport() {
    console.log('\n📊 Generating AI Test Report...\n');

    const report = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: `You are a QA expert analyzing E2E test results. 
            Provide insights on:
            1. Test reliability and coverage
            2. Performance issues
            3. Potential bugs or UX problems
            4. Recommendations for improvement`
        },
        {
          role: "user",
          content: `Analyze these test results:
            Success: ${this.results.success}
            Duration: ${this.results.duration}ms
            Output: ${this.results.output.substring(0, 3000)}
            Errors: ${this.results.errorOutput}

            Generate a comprehensive report with actionable insights.`
        }
      ]
    });
    const result = message.content[0].text;
    const aiReport = report.choices[0].message.content;

    // Create HTML report
    const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <title>AI E2E Test Report - ${new Date().toISOString()}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #0070f3; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .status-pass { color: #0cce6b; }
    .status-fail { color: #ff4b4b; }
    .metric { background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .ai-insights { background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .screenshot { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; margin: 10px 0; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="header">
    <h1>AI-Powered E2E Test Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <p>Status: <span class="${this.results.success ? 'status-pass' : 'status-fail'}">
      ${this.results.success ? '✅ PASSED' : '❌ FAILED'}
    </span></p>
  </div>

  <div class="metric">
    <h3>Test Metrics</h3>
    <p>Duration: ${(this.results.duration / 1000).toFixed(2)}s</p>
    <p>Tests Run: ${this.countTests(this.results.output)}</p>
  </div>

  <div class="ai-insights">
    <h3>🤖 AI Analysis & Insights</h3>
    <div style="white-space: pre-wrap;">${aiReport}</div>
  </div>

  <h3>Screenshots</h3>
  ${await this.getScreenshotHTML()}

  <h3>Test Output</h3>
  <pre>${this.results.output}</pre>

  ${this.results.errorOutput ? `
    <h3>Errors</h3>
    <pre style="color: #ff4b4b;">${this.results.errorOutput}</pre>
  ` : ''}
</body>
</html>`;

    const reportPath = `tests/e2e/reports/report-${Date.now()}.html`;
    await fs.writeFile(reportPath, htmlReport);

    console.log(`✅ Report generated: ${reportPath}\n`);
    console.log('🤖 AI Insights:', aiReport);
  }

  async detectFlakyTests() {
    // Read historical test results
    const reports = await fs.readdir('tests/e2e/reports');
    const jsonReports = reports.filter(f => f.endsWith('.json'));

    if (jsonReports.length < 3) return; // Need history to detect flakiness

    const history = [];
    for (const report of jsonReports.slice(-5)) { // Last 5 runs
      const data = await fs.readFile(`tests/e2e/reports/${report}`, 'utf-8');
      history.push(JSON.parse(data));
    }

    const flakyAnalysis = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: "Analyze test history to identify flaky tests and patterns."
        },
        {
          role: "user",
          content: `Test history (last 5 runs): ${JSON.stringify(history)}
            Identify any flaky tests, patterns, and root causes.`
        }
      ]
    });
    const result = message.content[0].text;
    
    console.log('\n🔍 Flaky Test Analysis:', flakyAnalysis.choices[0].message.content);
  }

  countTests(output) {
    const matches = output.match(/(\d+) passed/);
    return matches ? matches[1] : '0';
  }

  async getScreenshotHTML() {
    try {
      const screenshots = await fs.readdir('tests/e2e/screenshots');
      return screenshots.map(file => 
        `<img src="../screenshots/${file}" alt="${file}" class="screenshot" />`
      ).join('\n');
    } catch (e) {
      return '<p>No screenshots available</p>';
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new AITestRunner();
  runner.runTests().catch(console.error);
}