import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.vite/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'index.html',
      'worker.js',
      'sw.js',
      // Static assets served as-is by Vite.
      'apps/web/public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // CI / build / tooling scripts run under Node, not the browser. The
  // recommended JS config doesn't preload Node globals so plain `.mjs`
  // scripts need them declared here.
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);
