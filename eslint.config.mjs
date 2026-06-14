// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import shiranami from '@shiranami/eslint-plugin';

// Files where a hard process exit is legitimate (Electron main, native
// bindings, the server entrypoints, and repo scripts).
const PROCESS_EXIT_ALLOWLIST = [
  'apps/desktop/src/main/**',
  'apps/desktop/src/native/**',
  'apps/server/**',
  'scripts/**',
  '**/scripts/**',
  'tools/**',
];

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      shiranami,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // Custom @shiranami/eslint-plugin rules. Severity is 'error' or 'off',
      // never 'warn' (enforced by the eslint-config-no-warn meta-rule).
      'shiranami/no-narration-comments': 'error',
      'shiranami/no-error-stringify': 'error',
      'shiranami/no-template-trim-empty-ternary': 'error',
      'shiranami/props-must-be-visual': 'error',
      'shiranami/no-process-exit': ['error', { allowedFiles: PROCESS_EXIT_ALLOWLIST }],
      'shiranami/no-historical-comments': 'error',
      'shiranami/no-pr-reference-comments': 'error',
      // Dormant rules (present but disabled — high churn or missing prerequisite).
      'shiranami/prefer-early-return': 'off',
      'shiranami/interface-prefix-i': 'off',
      'shiranami/no-direct-process-env': 'off',
      'shiranami/no-bare-date-now': 'off',
    },
  },
  // no-focused-tests is scoped to test files only.
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/test/**/*.{ts,tsx}', '**/e2e/**/*.{ts,tsx}'],
    rules: {
      'shiranami/no-focused-tests': 'error',
    },
  },
  // React + React Hooks, scoped to the renderer (apps/web).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      // Pinned, not 'detect': eslint-plugin-react@7's 'detect' path calls the
      // ESLint-9-removed context.getFilename(), which throws under ESLint 10.
      // An explicit semver skips detection. apps/web runs React 19.
      react: { version: '19.2' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      // TS owns prop types and the JSX transform is automatic.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // `cmdk-input-wrapper` is a required attribute of the cmdk primitive.
      'react/no-unknown-property': ['error', { ignore: ['cmdk-input-wrapper'] }],
      // Correctness — should be clean. exhaustive-deps would be noisy, so it
      // ships 'off' (backlog); that also keeps eslint-config-no-warn satisfied.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  // Component-architecture rules (Tier C), scoped to migrated feature folders.
  // The glob widens one feature per migration PR; today only downloads conforms.
  {
    files: ['apps/web/src/components/downloads/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/components/downloads/**/*.stories.{ts,tsx}',
      'apps/web/src/components/downloads/**/*.test.{ts,tsx}',
    ],
    rules: {
      'shiranami/component-folder-structure': 'error',
      'shiranami/index-must-reexport-default': 'error',
      'shiranami/no-state-in-component-body': 'error',
      'shiranami/no-jsx-computation': 'error',
      // shared = cross-feature escape hatch; ui = shadcn primitives (skipped dir).
      'shiranami/no-cross-feature-imports': ['error', { sharedFeatures: ['shared', 'ui'] }],
      'shiranami/max-hooks-per-file': 'error',
      'shiranami/interface-prefix-i': 'error',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/release/**',
      '**/.astro/**',
      '**/coverage/**',
      '**/generated/**',
      'packages/eslint-plugin/dist/**',
      '**/*.js',
    ],
  }
);
