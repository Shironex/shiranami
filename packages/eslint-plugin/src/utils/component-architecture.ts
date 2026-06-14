import path from 'node:path';

/*
 * Shared helpers for the frontend component-architecture rules. Only the subset
 * consumed by props-must-be-visual is ported into shiranami's plugin.
 */

/** Forward-slashed basename of a file (e.g. `LoginForm.tsx`). */
export function getBasename(filename: string): string {
  return path.basename(filename);
}

/**
 * True for a component entry file: a single PascalCase segment then `.tsx`
 * (`LoginForm.tsx`). Sidecars carry an extra dotted segment
 * (`LoginForm.hooks.ts`, `LoginForm.stories.tsx`, `LoginForm.test.tsx`) and are
 * intentionally excluded, as are kebab-case files (`login-form.tsx`).
 */
export function isComponentFileName(filename: string): boolean {
  return /^[A-Z][A-Za-z0-9]*\.tsx$/.test(getBasename(filename));
}
