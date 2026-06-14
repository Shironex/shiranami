import { type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { isAllowlisted } from '../utils/allowlist';
import { isStaticMemberAccess } from '../utils/ast';
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

// Matches both `process.env` and `process['env']` so a computed access cannot
// bypass the rule.
function isProcessEnv(node: TSESTree.Node): boolean {
  return isStaticMemberAccess(node, 'process', 'env');
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
      /*
       * `process.env` is itself a MemberExpression, so a single visitor on the
       * node catches every usage position: property access (`process.env.X`),
       * computed access (`process.env[X]`), destructuring (`const { X } =
       * process.env`), and bare value usage where it is passed as an argument,
       * returned, or assigned (`log(process.env)`, `return process.env`).
       */
      MemberExpression(node): void {
        if (isProcessEnv(node)) {
          report(node);
        }
      },
    };
  },
});
