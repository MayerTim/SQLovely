const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

const nodeGlobals = {
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  exports: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly',
};

module.exports = [
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**', 'out/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['test/formatter/**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
];
