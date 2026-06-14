import { noBareDateNowRule } from '../../src/rules/no-bare-date-now';
import { ruleTester } from '../test-utils/ruleTester';

const options = [{ allowedFiles: ['**/clock.ts', '**/*.timing.ts'] }] as const;

ruleTester.run('no-bare-date-now', noBareDateNowRule, {
  valid: [
    // Clock util replacements.
    {
      code: `const t = nowMs();`,
      filename: 'apps/web/src/lib/token.ts',
      options,
    },
    {
      code: `const d = now();`,
      filename: 'apps/web/src/lib/token.ts',
      options,
    },
    // `new Date(value)` with an argument is a parse, not a bare read.
    {
      code: `const d = new Date(nowMs() + 1000);`,
      filename: 'apps/web/src/lib/token.ts',
      options,
    },
    {
      code: `const d = new Date('2026-01-01T00:00:00Z');`,
      filename: 'apps/web/src/lib/token.ts',
      options,
    },
    // Allowlisted files keep bare Date (the clock util and timing sites).
    {
      code: `export function nowMs() { return Date.now(); }`,
      filename: 'packages/shared/src/clock.ts',
      options,
    },
    {
      code: `const start = Date.now();`,
      filename: 'apps/server/src/request.timing.ts',
      options,
    },
  ],
  invalid: [
    {
      code: `const t = Date.now();`,
      filename: 'apps/web/src/lib/token.ts',
      options,
      errors: [{ messageId: 'dateNow' }],
    },
    {
      code: `const d = new Date();`,
      filename: 'apps/web/src/lib/token.ts',
      options,
      errors: [{ messageId: 'newDate' }],
    },
  ],
});
