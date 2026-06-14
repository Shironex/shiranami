import { noTemplateTrimEmptyTernaryRule } from '../../src/rules/no-template-trim-empty-ternary';
import { ruleTester } from '../test-utils/ruleTester';

ruleTester.run('no-template-trim-empty-ternary', noTemplateTrimEmptyTernaryRule, {
  valid: [
    { code: 'const name = buildDisplayName({ first, last, fallback: email });' },
    { code: "const trimmed = value.trim() === '' ? fallback : value;" },
    { code: 'const label = `${first} ${last}`.trim();' },
  ],
  invalid: [
    {
      code: "const name = `${first} ${last}`.trim() === '' ? email : `${first} ${last}`.trim();",
      errors: [{ messageId: 'extractToUtil' }],
    },
    {
      code: "const name = '' !== `${a}`.trim() ? `${a}`.trim() : fallback;",
      errors: [{ messageId: 'extractToUtil' }],
    },
  ],
});
