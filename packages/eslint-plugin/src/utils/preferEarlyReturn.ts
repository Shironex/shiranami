import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

const MIN_CONSEQUENT_STATEMENTS = 2;

export function getFunctionBlockBody(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
): TSESTree.BlockStatement | null {
  if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return null;
  }
  return node.body;
}

/**
 * Returns the trailing `if` that wraps the function's happy path, or null.
 * Matches only the body-wrapping shape worth a guard clause: the last statement
 * is an `if` with no `else` whose block holds two or more statements.
 */
export function findWrappedHappyPathIf(body: TSESTree.BlockStatement): TSESTree.IfStatement | null {
  if (body.body.length === 0) {
    return null;
  }

  const lastStatement = body.body[body.body.length - 1];

  if (lastStatement === undefined || lastStatement.type !== AST_NODE_TYPES.IfStatement) {
    return null;
  }
  if (lastStatement.alternate !== null) {
    return null;
  }
  if (lastStatement.consequent.type !== AST_NODE_TYPES.BlockStatement) {
    return null;
  }
  if (lastStatement.consequent.body.length < MIN_CONSEQUENT_STATEMENTS) {
    return null;
  }

  return lastStatement;
}
