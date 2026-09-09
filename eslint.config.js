import js from '@eslint/js';
import ts from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  { ignores: ['dist/**', '.astro/**', '.wrangler/**', 'node_modules/**', 'public/navigation.js'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...astro.configs.recommended,
];
