import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import { isEmptyStringLiteral } from '../utils/ast';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-template-trim-empty-ternary';

type MessageIds = 'extractToUtil';

function isTrimCallOnTemplate(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'trim' &&
    node.callee.object.type === AST_NODE_TYPES.TemplateLiteral
  );
}

function matchesTemplateTrimEmptyTest(test: TSESTree.Expression): boolean {
  if (test.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }
  if (test.operator !== '===' && test.operator !== '!==') {
    return false;
  }
  return (
    (isTrimCallOnTemplate(test.left) && isEmptyStringLiteral(test.right)) ||
    (isEmptyStringLiteral(test.left) && isTrimCallOnTemplate(test.right))
  );
}

export const noTemplateTrimEmptyTernaryRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow inline `<template>.trim() === '' ? fallback : <template>.trim()` patterns. Extract to a named utility so the expression is built once and is unit-testable in one place.",
    },
    schema: [],
    messages: {
      extractToUtil:
        "Extract this `<template>.trim() === ''` fallback pattern to a named util (e.g. `buildDisplayName(...)`). The inline ternary builds the same expression twice and is not unit-testable in one place.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ConditionalExpression(node): void {
        if (matchesTemplateTrimEmptyTest(node.test)) {
          context.report({ node, messageId: 'extractToUtil' });
        }
      },
    };
  },
});
