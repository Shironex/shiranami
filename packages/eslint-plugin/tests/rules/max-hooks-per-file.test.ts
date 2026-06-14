import { maxHooksPerFileRule } from '../../src/rules/max-hooks-per-file';
import { ruleTester } from '../test-utils/ruleTester';

const QUERIES = 'apps/web/src/components/downloads/DownloadsView/DownloadsView.queries.ts';
const HOOKS = 'apps/web/src/components/downloads/DownloadsView/DownloadsView.hooks.ts';

const fourHooks = `
export function useA() { return 1; }
export function useB() { return 2; }
export const useC = () => 3;
export const useD = () => 4;
`;

const fiveHooks = `${fourHooks}
export function useE() { return 5; }
`;

// Hooks declared without inline `export`, then surfaced via a specifier list.
const fourHooksViaSpecifiers = `
function useA() { return 1; }
function useB() { return 2; }
const useC = () => 3;
const useD = () => 4;
export { useA, useB, useC, useD };
`;

const fiveHooksViaSpecifiers = `
function useA() { return 1; }
function useB() { return 2; }
const useC = () => 3;
const useD = () => 4;
function useE() { return 5; }
export { useA, useB, useC, useD, useE };
`;

// Aliasing hook exports to non-hook names must not circumvent the limit:
// the count is taken from the locally-declared hook factory, not the alias.
const fourHooksAliasedExports = `
function useA() { return 1; }
function useB() { return 2; }
const useC = () => 3;
const useD = () => 4;
export { useA as helperA, useB as helperB, useC as helperC, useD as helperD };
`;

const fiveHooksAliasedExports = `
function useA() { return 1; }
function useB() { return 2; }
const useC = () => 3;
const useD = () => 4;
function useE() { return 5; }
export { useA as helperA, useB as helperB, useC as helperC, useD as helperD, useE as helperE };
`;

ruleTester.run('max-hooks-per-file', maxHooksPerFileRule, {
  valid: [
    // Exactly the max is fine.
    { code: fourHooks, filename: QUERIES },
    // .hooks.ts is also a bucket file but four is within the limit.
    { code: fourHooks, filename: HOOKS },
    // Non-bucket files are not constrained even with many hooks.
    {
      code: fiveHooks,
      filename: 'apps/web/src/components/downloads/DownloadsView/DownloadsView.util.ts',
    },
    // Non-exported helpers do not count.
    {
      code: `function useInternal() { return 0; }\nexport function usePublic() { return 1; }`,
      filename: QUERIES,
    },
    // A raised `max` permits more hooks.
    { code: fiveHooks, filename: QUERIES, options: [{ max: 5 }] },
    // Re-exported hooks via a specifier list, within the limit.
    { code: fourHooksViaSpecifiers, filename: QUERIES },
    // Hooks exported under aliased (non-hook) names still count by their
    // local factory name; four is within the limit.
    { code: fourHooksAliasedExports, filename: QUERIES },
  ],
  invalid: [
    { code: fiveHooks, filename: QUERIES, errors: [{ messageId: 'tooManyHooks' }] },
    { code: fiveHooks, filename: HOOKS, errors: [{ messageId: 'tooManyHooks' }] },
    // A lowered `max` tightens the limit.
    {
      code: fourHooks,
      filename: QUERIES,
      options: [{ max: 3 }],
      errors: [{ messageId: 'tooManyHooks' }],
    },
    // Hooks re-exported via a single specifier list must also be counted.
    {
      code: fiveHooksViaSpecifiers,
      filename: QUERIES,
      errors: [{ messageId: 'tooManyHooks' }],
    },
    // Aliasing hook exports to non-hook names must not bypass the limit.
    {
      code: fiveHooksAliasedExports,
      filename: QUERIES,
      errors: [{ messageId: 'tooManyHooks' }],
    },
  ],
});
