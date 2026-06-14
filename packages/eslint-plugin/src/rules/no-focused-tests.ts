import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-focused-tests';

type MessageIds = 'focused' | 'focusedCall';

/**
 * Test runner identifiers whose `.only` member focuses a single test/suite.
 * Stack-neutral: matches both jest (api) and vitest (web, this plugin).
 */
const FOCUSABLE_RUNNERS = new Set(['it', 'describe', 'test']);

/**
 * Jest/Jasmine focused-test call forms (the prefix variants of `describe`/`it`).
 * `fdescribe('x')` / `fit('x')` / `ddescribe('x')` focus a suite/test exactly
 * like `.only` but are easy to miss because they are not a member access.
 */
const FOCUSED_CALL_NAMES = new Set(['fdescribe', 'fit', 'ddescribe']);

export const noFocusedTestsRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban focused tests (it.only / describe.only / test.only, fdescribe / fit / ddescribe) so a focused test never silently lands in CI.',
    },
    schema: [],
    messages: {
      focused:
        'Focused test: remove `.only` from `{{runner}}.only(...)` so the whole suite runs in CI.',
      focusedCall:
        'Focused test: replace `{{name}}(...)` with `{{base}}(...)` so the whole suite runs in CI.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      MemberExpression(node: TSESTree.MemberExpression): void {
        if (
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'only' &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          FOCUSABLE_RUNNERS.has(node.object.name)
        ) {
          context.report({
            node: node.property,
            messageId: 'focused',
            data: { runner: node.object.name },
          });
        }
      },
      CallExpression(node: TSESTree.CallExpression): void {
        // Only a bare-identifier callee (fdescribe(...)), never a member like
        // `obj.fdescribe()`, so an unrelated method named `fit` is not flagged.
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          FOCUSED_CALL_NAMES.has(node.callee.name)
        ) {
          const name = node.callee.name;
          context.report({
            node: node.callee,
            messageId: 'focusedCall',
            data: { name, base: name.startsWith('f') ? name.slice(1) : 'describe' },
          });
        }
      },
    };
  },
});
