import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { isAllowlisted } from '../utils/allowlist';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-direct-process-env';

export interface NoDirectProcessEnvOptions {
  readonly allowedFiles?: readonly string[];
  readonly singletonSuggestion?: string;
}

type RuleOptions = [NoDirectProcessEnvOptions];
type MessageIds = 'directProcessEnv';

/*
 * Files that legitimately read process.env outside the typed config seam:
 * bootstrap entrypoints, the universal logger (runs in Node, browser, and
 * Electron), build scripts, config files, and tests that stub env directly.
 * Consumers override `allowedFiles` to express their own boundary.
 */
const DEFAULT_ALLOWED_FILES: readonly string[] = [
  'apps/server/**',
  'apps/desktop/src/main/**',
  'apps/desktop/src/native/**',
  'packages/shared/**',
  'scripts/**',
  '**/scripts/**',
  '**/*.config.{ts,js,mjs,cjs}',
  '**/*.{spec,test}.{ts,tsx}',
];

const DEFAULT_SUGGESTION = 'the typed, validated config singleton';

const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    allowedFiles: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
    },
    singletonSuggestion: { type: 'string', minLength: 1 },
  },
};

function isProcessEnv(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === 'process' &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === 'env'
  );
}

export const noDirectProcessEnvRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct `process.env` access. Force every consumer through a typed, validated config singleton so a missing variable fails at boot, not at use.',
    },
    schema: [optionSchema],
    messages: {
      directProcessEnv:
        'Read environment variables via {{suggestion}}. `process.env.X` bypasses the boot-time validation.',
    },
  },
  defaultOptions: [
    {
      allowedFiles: [...DEFAULT_ALLOWED_FILES],
      singletonSuggestion: DEFAULT_SUGGESTION,
    },
  ],
  create(context, [options]) {
    const allowedFiles = options.allowedFiles ?? DEFAULT_ALLOWED_FILES;
    const suggestion = options.singletonSuggestion ?? DEFAULT_SUGGESTION;

    if (isAllowlisted(context.filename, allowedFiles)) {
      return {};
    }

    function report(node: TSESTree.Node): void {
      context.report({ node, messageId: 'directProcessEnv', data: { suggestion } });
    }

    return {
      // `process.env.X` (read or write) and `process.env[X]`
      MemberExpression(node): void {
        if (isProcessEnv(node.object)) {
          report(node);
        }
      },
      // `const { X, Y } = process.env`
      VariableDeclarator(node): void {
        if (node.init !== null && isProcessEnv(node.init)) {
          report(node.init);
        }
      },
      // `({ X } = process.env)` assignment-pattern destructure
      AssignmentExpression(node): void {
        if (node.left.type === AST_NODE_TYPES.ObjectPattern && isProcessEnv(node.right)) {
          report(node.right);
        }
      },
    };
  },
});
