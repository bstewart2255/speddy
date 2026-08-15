const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const path = require('path');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-html-link-for-pages': 'off',
      'react/no-unescaped-entities': 'off',
      // SPE-371 / SPE-97. Debug logging ran unconditionally in production, and
      // some of it printed student records, RPC payloads and staff full names
      // to the browser console. The sweep removed those; this stops the next
      // one landing.
      //
      // `warn` and `error` stay allowed — they are the only visibility into
      // things going wrong, and 775 console.error calls exist. What this
      // forbids is `console.log` and friends: output nobody reads in
      // production and nothing filters. Anything worth keeping goes through
      // lib/monitoring/logger.ts (redaction-aware) or lib/logger.ts
      // (level-gated) — or sits behind a debug flag with an inline exemption.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // These modules ARE the logging and observability layer, or exist purely to
    // print. The console access is their implementation, so the rule would be
    // banning them from doing their job. Two of them — logSentryStatus and the
    // SIS key boot line — are the deliberate one-per-cold-start signals that
    // make a bad DSN or a missing key visible at all (SPE-175).
    files: [
      'lib/logger.ts',
      'lib/monitoring/logger.ts',
      'lib/monitoring/sentry-options.ts',
      'lib/connectivity-utils.ts',
      'lib/utils/performance-monitor.ts',
      'lib/sis/key-boot-check.ts',
      'app/api/cron/**/*.ts',
      // Installs a development-only console.log filter — the console access is
      // the entire file.
      'instrumentation.ts',
    ],
    rules: { 'no-console': 'off' },
  },
];