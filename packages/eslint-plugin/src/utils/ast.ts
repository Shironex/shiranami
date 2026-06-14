import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

/** True for the empty-string literal `''` / `""`. */
export function isEmptyStringLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === '';
}
