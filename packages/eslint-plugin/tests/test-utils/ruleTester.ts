import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

// Rules that inspect sibling files call `readdirSync(dirname(context.filename))`.
// RuleTester passes `filename` through verbatim, so a relative path would resolve
// against the runner's cwd — which differs between `vitest` run from this package
// and from the workspace root. Anchor fixture paths to this file instead.
const FIXTURES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

export const fixture = (...segments: string[]): string => path.join(FIXTURES_ROOT, ...segments);

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.describeSkip = describe.skip;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.itSkip = it.skip;

export const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});
