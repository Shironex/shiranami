import { noPrReferenceCommentsRule } from '../../src/rules/no-pr-reference-comments';
import { ruleTester } from '../test-utils/ruleTester';

ruleTester.run('no-pr-reference-comments', noPrReferenceCommentsRule, {
  valid: [
    { code: '// Trust-proxy depth for Coolify single-host Traefik.' },
    { code: '// See the expressjs proxies guide for the rationale.' },
    { code: 'const channel = "#general";' },
  ],
  invalid: [
    {
      code: '// See https://github.com/Shironex/shiranami/pull/42 for context.',
      errors: [{ messageId: 'prReferenceComment' }],
    },
    {
      code: '// fixes #123',
      errors: [{ messageId: 'prReferenceComment' }],
    },
    {
      code: '// workaround (#88)',
      errors: [{ messageId: 'prReferenceComment' }],
    },
  ],
});
