/*
 * Recommended severities for consumers of this plugin. The repo's own
 * enablement lives in the root eslint.config.mjs (where no-focused-tests is
 * additionally scoped to test files and no-process-exit carries an allowlist);
 * this map is the documented default set.
 *
 * Dormant rules ship 'off' because their violation count is codebase-dependent
 * or a prerequisite (a clock util, an I-prefix convention) does not yet exist.
 * Enable them per-repo once the tree is clean — the no-warn policy forbids a
 * 'warn' rollout.
 */
export const recommendedRules = {
  'shiranami/no-historical-comments': 'error',
  'shiranami/no-narration-comments': 'error',
  'shiranami/no-pr-reference-comments': 'error',
  'shiranami/no-focused-tests': 'error',
  'shiranami/no-error-stringify': 'error',
  'shiranami/no-template-trim-empty-ternary': 'error',
  'shiranami/props-must-be-visual': 'error',
  'shiranami/no-process-exit': 'error',
  // Dormant (ship 'off').
  'shiranami/prefer-early-return': 'off',
  'shiranami/interface-prefix-i': 'off',
  'shiranami/no-direct-process-env': 'off',
  'shiranami/no-bare-date-now': 'off',
} as const;
