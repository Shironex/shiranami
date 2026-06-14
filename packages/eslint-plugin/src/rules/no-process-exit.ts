import { type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { isAllowlisted } from '../utils/allowlist';
import { isStaticMemberAccess } from '../utils/ast';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-process-exit';

export interface NoProcessExitOptions {
  readonly allowedFiles?: readonly string[];
}

type RuleOptions = [NoProcessExitOptions];
type MessageIds = 'processExit';

/*
 * `process.exit()` belongs only to bootstrap/shutdown paths and standalone
 * CLIs, never to request-scoped or renderer code where it would kill the whole
 * process mid-flight. The Electron main process, native bindings, the server
 * entrypoints, and repo scripts are the legitimate exit sites; consumers
 * override `allowedFiles` to express their own boundary.
 */
const DEFAULT_ALLOWED_FILES: readonly string[] = [
  'apps/desktop/src/main/**',
  'apps/desktop/src/native/**',
  'apps/server/**',
  'scripts/**',
  '**/scripts/**',
  '**/*.config.{ts,js,mjs,cjs}',
];

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

// Matches both `process.exit(...)` and `process['exit'](...)` so a computed
// callee cannot bypass the rule.
function isProcessExit(node: TSESTree.CallExpression): boolean {
  return isStaticMemberAccess(node.callee, 'process', 'exit');
}

export const noProcessExitRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `process.exit()` outside bootstrap/shutdown paths and standalone CLIs. Renderer and service code must throw or reject so the lifecycle can shut down gracefully.',
    },
    schema: [optionSchema],
    messages: {
      processExit:
        '`process.exit()` is reserved for bootstrap/shutdown and CLI entrypoints. Throw or reject and let the lifecycle handle teardown.',
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
        if (isProcessExit(node)) {
          context.report({ node, messageId: 'processExit' });
        }
      },
    };
  },
});
