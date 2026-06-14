import { noProcessExitRule } from '../../src/rules/no-process-exit';
import { ruleTester } from '../test-utils/ruleTester';

// Globs are `**/`-prefixed so they match regardless of the directory ESLint (or
// the rule tester) is invoked from, since the allowlist resolves paths relative
// to the workspace root.
const options = [{ allowedFiles: ['**/apps/desktop/src/main/**', '**/scripts/**'] }] as const;

ruleTester.run('no-process-exit', noProcessExitRule, {
  valid: [
    // Allowlisted CLI/bootstrap files may exit.
    {
      code: 'process.exit(1);',
      filename: 'scripts/bump-version.mjs',
      options,
    },
    {
      code: 'process.exit(0);',
      filename: 'apps/desktop/src/main/index.ts',
      options,
    },
    // Not process.exit.
    {
      code: 'queue.exit(0);',
      filename: 'apps/web/src/lib/queue.ts',
      options,
    },
  ],
  invalid: [
    {
      code: 'process.exit(1);',
      filename: 'apps/web/src/lib/player.ts',
      options,
      errors: [{ messageId: 'processExit' }],
    },
    // Computed callee must not bypass the rule.
    {
      code: "process['exit'](0);",
      filename: 'apps/web/src/lib/player.ts',
      options,
      errors: [{ messageId: 'processExit' }],
    },
  ],
});
