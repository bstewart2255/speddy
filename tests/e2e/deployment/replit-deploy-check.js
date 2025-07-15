// tests/e2e/deployment/replit-deploy-check.js
import { PreDeploymentChecker } from './pre-deploy-check.js';

// Simplified version for Replit
export async function runDeploymentChecks() {
  console.log('🚀 Running deployment checks in Replit...\n');

  const checker = new PreDeploymentChecker();

  // Run basic checks
  const results = {
    timestamp: new Date().toISOString(),
    environment: 'replit',
    checks: []
  };

  try {
    // 1. Check if app is running
    console.log('1️⃣ Checking if app is accessible...');
    const response = await fetch('http://localhost:3000');
    results.checks.push({
      name: 'App Accessibility',
      status: response.ok ? 'passed' : 'failed'
    });

    // 2. Run critical path tests
    console.log('2️⃣ Running critical path tests...');
    const pathResults = await checker.testCriticalPaths();
    results.checks.push(pathResults);

    // 3. Check database connection
    console.log('3️⃣ Verifying database connection...');
    const dbResults = await checker.verifyDatabaseState();
    results.checks.push(dbResults);

    // Print results
    console.log('\n📋 DEPLOYMENT CHECK RESULTS:');
    console.log('═'.repeat(50));

    let allPassed = true;
    for (const check of results.checks) {
      const icon = check.status === 'passed' ? '✅' : '❌';
      console.log(`${icon} ${check.name}: ${check.status.toUpperCase()}`);
      if (check.status !== 'passed') allPassed = false;
    }

    console.log('═'.repeat(50));
    console.log(`\n${allPassed ? '✅ All checks passed! Safe to deploy.' : '❌ Some checks failed. Fix issues before deploying.'}`);

    return allPassed;

  } catch (error) {
    console.error('❌ Deployment check error:', error);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDeploymentChecks().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}