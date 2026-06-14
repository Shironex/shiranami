import { noFocusedTestsRule } from '../../src/rules/no-focused-tests';
import { ruleTester } from '../test-utils/ruleTester';

ruleTester.run('no-focused-tests', noFocusedTestsRule, {
  valid: [
    { code: "it('runs', () => {});" },
    { code: "describe('suite', () => {});" },
    { code: "test('case', () => {});" },
    // A plain variable named `only` is not a focused test.
    { code: 'const only = true;' },
    // `.only` on something that is not a test runner is out of scope.
    { code: "queue.only('ignored');" },
    // A method named `fit` on some object is not the focused-test global.
    { code: "layout.fit('contain');" },
  ],
  invalid: [
    {
      code: "it.only('runs', () => {});",
      errors: [{ messageId: 'focused' }],
    },
    {
      code: "describe.only('suite', () => {});",
      errors: [{ messageId: 'focused' }],
    },
    {
      code: "test.only('case', () => {});",
      errors: [{ messageId: 'focused' }],
    },
    {
      code: "fit('runs', () => {});",
      errors: [{ messageId: 'focusedCall' }],
    },
    {
      code: "fdescribe('suite', () => {});",
      errors: [{ messageId: 'focusedCall' }],
    },
    {
      code: "ddescribe('suite', () => {});",
      errors: [{ messageId: 'focusedCall' }],
    },
  ],
});
