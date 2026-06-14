import { preferEarlyReturnRule } from '../../src/rules/prefer-early-return';
import { ruleTester } from '../test-utils/ruleTester';

ruleTester.run('prefer-early-return', preferEarlyReturnRule, {
  valid: [
    // Guard clause already used.
    {
      code: 'function f(x) {\n  if (!x) {\n    return;\n  }\n  doA();\n  doB();\n}',
    },
    // Single-statement if is not a body-wrap.
    {
      code: 'function f(x) {\n  if (x) {\n    doA();\n  }\n}',
    },
    // if/else is not a guard-clause candidate.
    {
      code: 'function f(x) {\n  if (x) {\n    doA();\n    doB();\n  } else {\n    doC();\n  }\n}',
    },
    // The wrapping if is not the last statement.
    {
      code: 'function f(x) {\n  if (x) {\n    doA();\n    doB();\n  }\n  doC();\n}',
    },
  ],
  invalid: [
    {
      code: 'function f(x) {\n  if (x) {\n    doA();\n    doB();\n  }\n}',
      errors: [{ messageId: 'preferEarlyReturn' }],
    },
    {
      code: 'const g = (x) => {\n  if (x > 0) {\n    doA();\n    doB();\n  }\n};',
      errors: [{ messageId: 'preferEarlyReturn' }],
    },
  ],
});
