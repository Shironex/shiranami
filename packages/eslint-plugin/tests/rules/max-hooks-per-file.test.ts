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
  ],
});
