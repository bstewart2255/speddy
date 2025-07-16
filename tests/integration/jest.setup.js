// tests/integration/jest.setup.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Verify required env vars are loaded
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
  'SUPABASE_SERVICE_KEY'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

console.log('✅ Environment variables loaded successfully');