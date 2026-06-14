import { noHistoricalCommentsRule } from '../../src/rules/no-historical-comments';
import { ruleTester } from '../test-utils/ruleTester';

ruleTester.run('no-historical-comments', noHistoricalCommentsRule, {
  valid: [
    { code: '// Resolve trace context, preferring the active span.' },
    { code: '// The pool size caps concurrent DB connections.' },
    // JSDoc blocks are exempt (they document current behavior).
    { code: '/**\n * We used to stringify here, but no longer.\n */\nconst x = 1;' },
    { code: 'const now = Date.now();' },
  ],
  invalid: [
    {
      code: '// We used to read process.env directly here.',
      errors: [{ messageId: 'historicalComment' }],
    },
    {
      code: '// Before the fix this collapsed to {}.',
      errors: [{ messageId: 'historicalComment' }],
    },
    {
      code: '// Kept for backwards compatibility with the old client.',
      errors: [{ messageId: 'historicalComment' }],
    },
    {
      code: '/* This no longer applies after the rewrite. */',
      errors: [{ messageId: 'historicalComment' }],
    },
  ],
});
