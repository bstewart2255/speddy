// scripts/run-integration-tests.js
const { execSync } = require('child_process');

// Ensure all Replit secrets are available
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  NODE_ENV: 'test'
};

console.log('Starting integration tests...');
console.log('Service key available:', !!env.SUPABASE_SERVICE_KEY);
console.log('Service key length:', env.SUPABASE_SERVICE_KEY?.length);

try {
  execSync('jest --config=jest.integration.config.js', {
    stdio: 'inherit',
    env: env
  });
} catch (error) {
  // Jest will handle its own exit codes
  process.exit(error.status || 1);
}