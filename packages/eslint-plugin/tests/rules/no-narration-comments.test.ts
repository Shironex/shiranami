import { noNarrationCommentsRule } from '../../src/rules/no-narration-comments';
import { ruleTester } from '../test-utils/ruleTester';

ruleTester.run('no-narration-comments', noNarrationCommentsRule, {
  valid: [
    { code: '// Caps concurrent connections to avoid pool exhaustion.' },
    { code: '// WHY: Prisma reuses the pooled connection across requests.' },
    // JSDoc is exempt.
    { code: '/**\n * Now we normalize the error.\n */\nconst x = 1;' },
    // "next" as a word mid-sentence is fine; only leading narration matches.
    { code: '// call next() to continue the middleware chain' },
  ],
  invalid: [
    {
      code: '// Now we attach the user to the socket.',
      errors: [{ messageId: 'narrationComment' }],
    },
    {
      code: '// First, we parse the cookies.',
      errors: [{ messageId: 'narrationComment' }],
    },
    {
      code: "// Let's validate the session token.",
      errors: [{ messageId: 'narrationComment' }],
    },
    {
      code: '// Here we join the user room.',
      errors: [{ messageId: 'narrationComment' }],
    },
  ],
});
