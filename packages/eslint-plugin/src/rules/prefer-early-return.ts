import type { TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';
import { findWrappedHappyPathIf, getFunctionBlockBody } from '../utils/preferEarlyReturn';

export const RULE_NAME = 'prefer-early-return';

type MessageIds = 'preferEarlyReturn';

export const preferEarlyReturnRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer guard clauses (early return) over wrapping the whole function body in a multi-statement `if` without an `else`.',
    },
    schema: [],
    messages: {
      preferEarlyReturn:
        'Use a guard clause (early return) instead of wrapping the function body in an `if`. Invert the condition and return early so the happy path stays at the top level.',
    },
  },
  defaultOptions: [],
  create(context) {
    function checkFunctionBody(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
    ): void {
      const body = getFunctionBlockBody(node);
      if (body === null) {
        return;
      }
      const wrappedIf = findWrappedHappyPathIf(body);
      if (wrappedIf !== null) {
        context.report({ node: wrappedIf, messageId: 'preferEarlyReturn' });
      }
    }

    return {
      FunctionDeclaration: checkFunctionBody,
      FunctionExpression: checkFunctionBody,
      ArrowFunctionExpression: checkFunctionBody,
    };
  },
});
