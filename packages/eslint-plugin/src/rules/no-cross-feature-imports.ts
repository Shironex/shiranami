import path from 'node:path';

import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { createRule } from '../utils/createRule';
import { getFeatureName } from '../utils/component-architecture';

export const RULE_NAME = 'no-cross-feature-imports';

export interface NoCrossFeatureImportsOptions {
  readonly sharedFeatures?: readonly string[];
  readonly allowTypeImports?: boolean;
}

type RuleOptions = [NoCrossFeatureImportsOptions];
type MessageIds = 'crossFeatureImport';

/*
 * A file in `components/A` may not import runtime code from `components/B`:
 * features stay decoupled so a change in one cannot ripple into another. Shared
 * code lives in `@/lib`, `@/stores`, `@/hooks`, or a designated shared feature
 * (`components/shared`, importable by all). Type-only imports are allowed by
 * default. Both the `@/components/<feature>` alias form and relative paths that
 * climb into another feature are detected.
 */
const COMPONENT_ALIAS = /^@\/components\/([^/]+)/;

const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sharedFeatures: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    allowTypeImports: { type: 'boolean' },
  },
};

function resolveTargetFeature(source: string, currentFile: string): string | null {
  const aliasMatch = COMPONENT_ALIAS.exec(source);
  if (aliasMatch) {
    return aliasMatch[1] ?? null;
  }
  if (source.startsWith('.')) {
    const resolved = path.resolve(path.dirname(currentFile), source);
    return getFeatureName(resolved);
  }
  return null;
}

export const noCrossFeatureImportsRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'A file in one feature may not import runtime code from another feature. Move shared code to `@/lib`, `@/stores`, `@/hooks`, or `components/shared`.',
    },
    schema: [optionSchema],
    messages: {
      crossFeatureImport:
        'Cross-feature import: `{{current}}` may not import from `components/{{target}}`. Move shared code to `@/lib`, `@/stores`, `@/hooks`, or `components/shared`.',
    },
  },
  defaultOptions: [{ sharedFeatures: ['shared'], allowTypeImports: true }],
  create(context, [options]) {
    const sharedFeatures = options.sharedFeatures ?? ['shared'];
    const allowTypeImports = options.allowTypeImports ?? true;

    const current = getFeatureName(context.filename);
    if (current === null) {
      return {};
    }

    function check(node: TSESTree.ImportDeclaration): void {
      if (allowTypeImports && node.importKind === 'type') {
        return;
      }
      const source = node.source.value;
      const target = resolveTargetFeature(source, context.filename);
      if (target === null || target === current || sharedFeatures.includes(target)) {
        return;
      }
      context.report({
        node: node.source,
        messageId: 'crossFeatureImport',
        data: { current, target },
      });
    }

    return {
      ImportDeclaration(node): void {
        if (node.source.type === AST_NODE_TYPES.Literal && typeof node.source.value === 'string') {
          check(node);
        }
      },
    };
  },
});
