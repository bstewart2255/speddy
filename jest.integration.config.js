// jest.integration.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.js'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/integration/jest.setup.js'],
  // Add this to ensure env vars are available
  setupFiles: ['<rootDir>/tests/integration/jest.setup.js'],
};

module.exports = createJestConfig(customJestConfig);