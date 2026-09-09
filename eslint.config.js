import js from '@eslint/js';
import ts from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  { ignores: ['dist/**', '.astro/**', '.wrangler/**', 'node_modules/**', 'public/navigation.js'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/lib/text.ts'],
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['tools/**/*.ts', 'src/env.d.ts'],
    rules: { 'no-empty': 'off', '@typescript-eslint/no-empty-object-type': 'off' },
  },
];
