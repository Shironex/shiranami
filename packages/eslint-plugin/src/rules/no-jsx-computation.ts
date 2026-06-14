import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-jsx-computation';

type MessageIds = 'arrayMethod' | 'arithmetic' | 'chainedLogical';

/*
 * Keep JSX declarative: no `.map`/`.filter`/`.reduce`/`.sort`/`.find`/`.flatMap`,
 * no arithmetic, and no chained `&&`/`||` directly inside a JSX child `{...}`.
 * Lift the computation to a `const` above the `return`, or into the hook. A
 * single `{cond && <X/>}` guard and ternaries stay allowed; only chained logical
 * expressions are flagged. Computation inside event handlers (`onClick={() =>
 * items.map(...)}`) is fine and is not flagged (it is not render-time work).
 */
const ARRAY_METHODS = new Set(['map', 'filter', 'reduce', 'sort', 'find', 'flatMap']);
const ARITHMETIC_OPERATORS = new Set(['-', '*', '/', '%', '**']);

/**
 * True when `node` is evaluated directly in a JSX child expression container,
 * not inside a nested function (event handler / render-prop) on the way up.
 */
function isInJsxRenderPosition(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.FunctionDeclaration
    ) {
      return false;
    }
    if (current.type === AST_NODE_TYPES.JSXExpressionContainer) {
      const parent = current.parent;
      return (
        parent !== undefined &&
        (parent.type === AST_NODE_TYPES.JSXElement || parent.type === AST_NODE_TYPES.JSXFragment)
      );
    }
    current = current.parent;
  }
  return false;
}

export const noJsxComputationRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow array methods, arithmetic, and chained logical expressions directly inside JSX `{...}`. Lift them to a const above the return or into the hook.',
    },
    schema: [],
    messages: {
      arrayMethod:
        'Move `.{{method}}(...)` out of JSX. Compute the list in a const above the return (or in the hook) and render the result.',
      arithmetic:
        'Move this arithmetic out of JSX. Compute it in a const above the return (or in the hook).',
      chainedLogical:
        'Move this chained logical expression out of JSX. Compute the boolean in a const above the return (or in the hook).',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node): void {
        const callee = node.callee;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          ARRAY_METHODS.has(callee.property.name) &&
          isInJsxRenderPosition(node)
        ) {
          context.report({
            node,
            messageId: 'arrayMethod',
            data: { method: callee.property.name },
          });
        }
      },
      BinaryExpression(node): void {
        if (ARITHMETIC_OPERATORS.has(node.operator) && isInJsxRenderPosition(node)) {
          context.report({ node, messageId: 'arithmetic' });
        }
      },
      LogicalExpression(node): void {
        const chained =
          node.left.type === AST_NODE_TYPES.LogicalExpression ||
          node.right.type === AST_NODE_TYPES.LogicalExpression;
        // Report once, on the outermost link of the chain.
        if (
          chained &&
          node.parent?.type !== AST_NODE_TYPES.LogicalExpression &&
          isInJsxRenderPosition(node)
        ) {
          context.report({ node, messageId: 'chainedLogical' });
        }
      },
    };
  },
});
