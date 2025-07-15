// tests/e2e/monitor/continuous-monitor.js
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { AITestRunner } from '../runner/test-runner.js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export class ContinuousMonitor {
  constructor() {
    this.runner = new AITestRunner();
    this.alertThreshold = 3; // Number of failures before alerting
    this.consecutiveFailures = 0;

    // Email setup (optional)
    this.mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }) : null;
  }

  async start() {
    console.log('🔍 Starting Continuous E2E Monitoring...\n');

    // Initialize monitoring table in Supabase
    await this.initializeDatabase();

    // Run tests immediately
    await this.runMonitoringCycle();

    // Schedule regular runs (every hour)
    cron.schedule('0 * * * *', async () => {
      await this.runMonitoringCycle();
    });

    // Schedule daily report
    cron.schedule('0 9 * * *', async () => {
      await this.generateDailyReport();
    });

    console.log('✅ Monitoring scheduled - Tests will run every hour\n');
  }

  async initializeDatabase() {
    // Create monitoring table if it doesn't exist
    const { error } = await supabase.rpc('create_monitoring_table', {
      table_sql: `
        CREATE TABLE IF NOT EXISTS e2e_test_results (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          success BOOLEAN NOT NULL,
          duration INTEGER NOT NULL,
          test_count INTEGER,
          failed_tests JSONB,
          performance_metrics JSONB,
          ai_insights TEXT,
          screenshots JSONB,
          error_logs TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_e2e_created_at ON e2e_test_results(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_e2e_success ON e2e_test_results(success);
      `
    });

    if (error && !error.message.includes('already exists')) {
      console.error('Database setup error:', error);
    }
  }

  async runMonitoringCycle() {
    console.log(`\n🔄 Running monitoring cycle at ${new Date().toLocaleString()}\n`);

    try {
      // Run the tests
      await this.runner.runTests();

      // Analyze results
      const analysis = await this.analyzeResults();

      // Store in database
      await this.storeResults(analysis);

      // Check for alerts
      await this.checkAlerts(analysis);

      // Update dashboard
      await this.updateDashboard(analysis);

    } catch (error) {
      console.error('Monitoring cycle error:', error);
      await this.handleCriticalError(error);
    }
  }

  async analyzeResults() {
    const results = this.runner.results;

    // Extract failed tests
    const failedTests = this.extractFailedTests(results.output);

    // Get performance metrics
    const performanceMetrics = await this.collectPerformanceMetrics();

    // Get AI insights
    const aiInsights = await this.getAIInsights(results, failedTests, performanceMetrics);

    return {
      success: results.success,
      duration: results.duration,
      testCount: this.runner.countTests(results.output),
      failedTests,
      performanceMetrics,
      aiInsights,
      errorLogs: results.errorOutput
    };
  }

  extractFailedTests(output) {
    const failedTests = [];
    const failureRegex = /✕\s+(.+)\s+\((\d+)\s+ms\)/g;
    let match;

    while ((match = failureRegex.exec(output)) !== null) {
      failedTests.push({
        name: match[1],
        duration: parseInt(match[2])
      });
    }

    return failedTests;
  }

  async collectPerformanceMetrics() {
    // This would be collected during actual test runs
    return {
      pageLoadTimes: {
        home: 1245,
        login: 892,
        dashboard: 1567
      },
      apiResponseTimes: {
        auth: 234,
        userData: 456
      },
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  async getAIInsights(results, failedTests, metrics) {
    const prompt = `Analyze these E2E test results:
      Success: ${results.success}
      Duration: ${results.duration}ms
      Failed Tests: ${JSON.stringify(failedTests)}
      Performance: ${JSON.stringify(metrics)}

      Provide:
      1. Root cause analysis for failures
      2. Performance degradation detection
      3. User experience impact assessment
      4. Prioritized action items`;

    const response = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: "You are a QA expert providing actionable insights from E2E test results."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });
    const result = message.content[0].text;

    return response.choices[0].message.content;
  }

  async storeResults(analysis) {
    const { error } = await supabase
      .from('e2e_test_results')
      .insert([{
        success: analysis.success,
        duration: analysis.duration,
        test_count: analysis.testCount,
        failed_tests: analysis.failedTests,
        performance_metrics: analysis.performanceMetrics,
        ai_insights: analysis.aiInsights,
        error_logs: analysis.errorLogs
      }]);

    if (error) {
      console.error('Failed to store results:', error);
    }
  }

  async checkAlerts(analysis) {
    if (!analysis.success) {
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.alertThreshold) {
        await this.sendAlert(analysis);
      }
    } else {
      this.consecutiveFailures = 0;
    }

    // Check for performance degradation
    const perfDegradation = await this.checkPerformanceDegradation(analysis.performanceMetrics);
    if (perfDegradation) {
      await this.sendPerformanceAlert(perfDegradation);
    }
  }

  async checkPerformanceDegradation(currentMetrics) {
    // Get historical averages from last 7 days
    const { data: historicalData } = await supabase
      .from('e2e_test_results')
      .select('performance_metrics')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .eq('success', true);

    if (!historicalData || historicalData.length < 10) return null;

    // Calculate averages
    const avgPageLoadTimes = {};
    for (const page in currentMetrics.pageLoadTimes) {
      const historical = historicalData
        .map(d => d.performance_metrics?.pageLoadTimes?.[page])
        .filter(Boolean);

      const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
      const current = currentMetrics.pageLoadTimes[page];

      if (current > avg * 1.5) { // 50% slower than average
        avgPageLoadTimes[page] = {
          current,
          average: avg,
          degradation: ((current - avg) / avg * 100).toFixed(2) + '%'
        };
      }
    }

    return Object.keys(avgPageLoadTimes).length > 0 ? avgPageLoadTimes : null;
  }

  async sendAlert(analysis) {
    const alertMessage = `
🚨 E2E Tests Failed ${this.consecutiveFailures} times in a row!

Failed Tests:
${analysis.failedTests.map(t => `- ${t.name} (${t.duration}ms)`).join('\n')}

AI Analysis:
${analysis.aiInsights}

View detailed report: ${process.env.BASE_URL}/admin/e2e-dashboard
    `;

    console.error(alertMessage);

    // Send email if configured
    if (this.mailer) {
      await this.mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.ALERT_EMAILS,
        subject: `🚨 E2E Tests Critical Failure - ${new Date().toLocaleDateString()}`,
        text: alertMessage
      });
    }

    // Send to Slack/Discord webhook if configured
    if (process.env.WEBHOOK_URL) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: alertMessage })
      });
    }
  }

  async sendPerformanceAlert(degradation) {
    const message = `
⚠️ Performance Degradation Detected!

${Object.entries(degradation).map(([page, data]) => 
  `${page}: ${data.current}ms (avg: ${data.average}ms) - ${data.degradation} slower`
).join('\n')}

This may impact user experience. Please investigate.
    `;

    console.warn(message);
    // Send alerts as configured...
  }

  async updateDashboard(analysis) {
    // Update real-time dashboard data
    const dashboardData = {
      lastRun: new Date().toISOString(),
      status: analysis.success ? 'healthy' : 'failing',
      consecutiveFailures: this.consecutiveFailures,
      recentTests: await this.getRecentTests(),
      performanceTrends: await this.getPerformanceTrends(),
      aiSummary: analysis.aiInsights
    };

    // Store in Supabase for real-time subscriptions
    await supabase
      .from('e2e_dashboard')
      .upsert([{
        id: 'current',
        data: dashboardData,
        updated_at: new Date().toISOString()
      }]);
  }

  async getRecentTests() {
    const { data } = await supabase
      .from('e2e_test_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return data;
  }

  async getPerformanceTrends() {
    const { data } = await supabase
      .from('e2e_test_results')
      .select('created_at, performance_metrics')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });

    return data;
  }

  async generateDailyReport() {
    const { data: dailyResults } = await supabase
      .from('e2e_test_results')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const report = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: "Generate an executive summary of E2E test results for the last 24 hours."
        },
        {
          role: "user",
          content: `Results: ${JSON.stringify(dailyResults)}
            Include: success rate, performance trends, critical issues, and recommendations.`
        }
      ]
    });
    const result = message.content[0].text;
    
    console.log('\n📊 Daily E2E Test Report:', report.choices[0].message.content);

    // Send daily report via email/webhook
    if (this.mailer) {
      await this.mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.REPORT_EMAILS,
        subject: `📊 Daily E2E Test Report - ${new Date().toLocaleDateString()}`,
        text: report.choices[0].message.content
      });
    }
  }

  async handleCriticalError(error) {
    console.error('Critical monitoring error:', error);

    // Store error in database
    await supabase
      .from('e2e_test_results')
      .insert([{
        success: false,
        duration: 0,
        test_count: 0,
        error_logs: error.stack,
        ai_insights: 'Critical error - monitoring system failure'
      }]);

    // Send immediate alert
    if (this.mailer) {
      await this.mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.ALERT_EMAILS,
        subject: '🔥 E2E Monitoring System Critical Error',
        text: `The E2E monitoring system encountered a critical error:\n\n${error.stack}`
      });
    }
  }
}

// Start monitoring if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new ContinuousMonitor();
  monitor.start().catch(console.error);
}