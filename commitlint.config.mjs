/**
 * Commitlint config — Conventional Commits.
 * Used by .husky/commit-msg and tracked in PR titles via pr-title-lint.yml.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow longer subjects than the 72-char default; squash-merge titles get long.
    'header-max-length': [2, 'always', 100],
    // Enforce lowercase start — disallow any capitalized-first-letter cases.
    'subject-case': [2, 'never', ['sentence-case', 'pascal-case', 'upper-case', 'start-case']],
  },
};
