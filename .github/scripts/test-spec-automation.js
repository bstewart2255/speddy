// Test script to verify spec automation with OpenAI
const SpecAutomation = require('./spec-automation.js');

// Mock environment variables for testing
if (!process.env.GITHUB_TOKEN) {
  console.log('⚠️  GITHUB_TOKEN not set - using mock mode');
  process.env.GITHUB_TOKEN = 'mock-token';
}

if (!process.env.OPENAI_API_KEY) {
  console.log('⚠️  OPENAI_API_KEY not set - specs will use fallback template mode');
}

console.log('🧪 Testing Spec Automation Script');
console.log('================================');
console.log('Environment check:');
console.log(`- GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log('');

// Test the OpenAI initialization
try {
  const automation = new SpecAutomation.SpecAutomation();
  console.log('✅ SpecAutomation initialized successfully');
  
  if (automation.openai) {
    console.log('✅ OpenAI client initialized');
  } else {
    console.log('⚠️  OpenAI client not initialized');
  }
  
  console.log('');
  console.log('📝 Script is ready to use!');
  console.log('');
  console.log('Usage:');
  console.log('  node .github/scripts/spec-automation.js all        # Process all issues with needs-spec label');
  console.log('  node .github/scripts/spec-automation.js 123        # Process specific issue #123');
  console.log('  node .github/scripts/spec-automation.js 123,456    # Process multiple specific issues');
  
} catch (error) {
  console.error('❌ Error initializing SpecAutomation:', error.message);
  process.exit(1);
}