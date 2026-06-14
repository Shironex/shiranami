import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

/** True for the empty-string literal `''` / `""`. */
export function isEmptyStringLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === '';
}

/**
 * True when `node` is a member access of `objectName.propertyName`, matching
 * both the dot form (`process.env`) and the computed string-literal form
 * (`process['env']`) so a computed access cannot bypass the check.
 */
export function isStaticMemberAccess(
  node: TSESTree.Node,
  objectName: string,
  propertyName: string
): boolean {
  if (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    node.object.type !== AST_NODE_TYPES.Identifier ||
    node.object.name !== objectName
  ) {
    return false;
  }
  if (node.computed) {
    return node.property.type === AST_NODE_TYPES.Literal && node.property.value === propertyName;
  }
  return node.property.type === AST_NODE_TYPES.Identifier && node.property.name === propertyName;
}
