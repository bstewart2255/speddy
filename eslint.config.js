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
    },
  },
];