import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { isAllowlisted } from '../utils/allowlist';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-bare-date-now';

export interface NoBareDateNowOptions {
  readonly allowedFiles?: readonly string[];
}

type RuleOptions = [NoBareDateNowOptions];
type MessageIds = 'dateNow' | 'newDate';

/*
 * Business logic must read wall-clock time through a shared `clock` util
 * (`now()` / `nowMs()`), not bare `Date.now()` / `new Date()`, so time-dependent
 * code has one mockable seam. Allowlisted: the clock util itself and
 * elapsed-time measurement sites where a wall-clock abstraction is the wrong
 * tool. Only zero-argument `new Date()` is flagged; `new Date(value)` (parsing
 * an explicit instant) is fine. Consumers override `allowedFiles`.
 */
const DEFAULT_ALLOWED_FILES: readonly string[] = ['**/clock.ts', '**/clock/*.ts'];

const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    allowedFiles: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
    },
  },
};

function isDateNowCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Date' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'now'
  );
}

function isBareNewDate(node: TSESTree.NewExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Date' &&
    node.arguments.length === 0
  );
}

export const noBareDateNowRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow bare `Date.now()` / `new Date()` in business logic. Read wall-clock time through a shared `clock` util (`nowMs()` / `now()`) so time is mockable.',
    },
    schema: [optionSchema],
    messages: {
      dateNow: 'Use `nowMs()` from the shared `clock` util instead of bare `Date.now()`.',
      newDate: 'Use `now()` from the shared `clock` util instead of bare `new Date()`.',
    },
  },
  defaultOptions: [{ allowedFiles: [...DEFAULT_ALLOWED_FILES] }],
  create(context, [options]) {
    const allowedFiles = options.allowedFiles ?? DEFAULT_ALLOWED_FILES;

    if (isAllowlisted(context.filename, allowedFiles)) {
      return {};
    }

    return {
      CallExpression(node): void {
        if (isDateNowCall(node)) {
          context.report({ node, messageId: 'dateNow' });
        }
      },
      NewExpression(node): void {
        if (isBareNewDate(node)) {
          context.report({ node, messageId: 'newDate' });
        }
      },
    };
  },
});
