import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { createRule } from '../utils/createRule';
import { isHookBucketFile } from '../utils/component-architecture';

export const RULE_NAME = 'max-hooks-per-file';

export interface MaxHooksPerFileOptions {
  readonly max?: number;
}

type RuleOptions = [MaxHooksPerFileOptions];
type MessageIds = 'tooManyHooks';

/*
 * A feature data file (`*.queries.ts`, `*.hooks.ts`, `*.mutations.ts`) that
 * exports more than `max` (default 4) `use*` hooks is doing too much; split it
 * before it becomes a grab-bag. Only exported hook factories count.
 */
const DEFAULT_MAX = 4;

const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    max: { type: 'integer', minimum: 1 },
  },
};

function isHookName(name: string | undefined): boolean {
  return name !== undefined && /^use[A-Z]/.test(name);
}

export const maxHooksPerFileRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'A `*.queries.ts` / `*.hooks.ts` / `*.mutations.ts` file may export at most `max` (default 4) `use*` hooks. Split larger files.',
    },
    schema: [optionSchema],
    messages: {
      tooManyHooks:
        'This file exports {{count}} `use*` hooks (max {{max}}). Split it into focused query/mutation files.',
    },
  },
  defaultOptions: [{ max: DEFAULT_MAX }],
  create(context, [options]) {
    const max = options.max ?? DEFAULT_MAX;
    if (!isHookBucketFile(context.filename)) {
      return {};
    }

    const exportedHooks = new Set<string>();

    function record(name: string | undefined): void {
      if (isHookName(name)) {
        exportedHooks.add(name as string);
      }
    }

    function handleExport(declaration: TSESTree.ExportNamedDeclaration['declaration']): void {
      if (declaration === null) {
        return;
      }
      if (declaration.type === AST_NODE_TYPES.FunctionDeclaration && declaration.id) {
        record(declaration.id.name);
        return;
      }
      if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const decl of declaration.declarations) {
          if (decl.id.type === AST_NODE_TYPES.Identifier) {
            record(decl.id.name);
          }
        }
      }
    }

    return {
      ExportNamedDeclaration(node): void {
        handleExport(node.declaration);
        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ExportSpecifier &&
            specifier.local.type === AST_NODE_TYPES.Identifier
          ) {
            record(specifier.local.name);
          }
        }
      },
      'Program:exit'(node): void {
        if (exportedHooks.size > max) {
          context.report({
            node,
            messageId: 'tooManyHooks',
            data: { count: exportedHooks.size, max },
          });
        }
      },
    };
  },
});
