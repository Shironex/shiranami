import path from 'node:path';

import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { createRule } from '../utils/createRule';
import {
  getComponentName,
  getFeatureName,
  isComponentEntryFile,
  isIgnoredPath,
  siblingExists,
} from '../utils/component-architecture';

export const RULE_NAME = 'component-folder-structure';

export interface ComponentFolderStructureOptions {
  readonly ignorePaths?: readonly string[];
  readonly requiredSiblings?: readonly string[];
}

type RuleOptions = [ComponentFolderStructureOptions];
type MessageIds = 'missingSiblings';

/*
 * A component entry file (`<Name>/<Name>.tsx` under `components/<feature>/`) must
 * ship its sibling set on disk so logic, types, story, and test always travel
 * with the component. The default set is the colocated `.hooks.ts`, `.types.ts`,
 * `.stories.tsx`, `.test.tsx`, and the `index.ts` barrel. `components/ui/**`
 * keeps the lighter shadcn convention and is excluded via `ignorePaths`.
 */
const DEFAULT_IGNORE_PATHS: readonly string[] = ['**/components/ui/**'];

function defaultRequiredSiblings(name: string): readonly string[] {
  return [
    `${name}.hooks.ts`,
    `${name}.types.ts`,
    `${name}.stories.tsx`,
    `${name}.test.tsx`,
    'index.ts',
  ];
}

const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ignorePaths: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    requiredSiblings: { type: 'array', items: { type: 'string' }, uniqueItems: true },
  },
};

export const componentFolderStructureRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'A component `<Name>/<Name>.tsx` under `components/<feature>/` must have its sibling set (`.hooks.ts`, `.types.ts`, `.stories.tsx`, `.test.tsx`, `index.ts`) present on disk.',
    },
    schema: [optionSchema],
    messages: {
      missingSiblings:
        'Component `{{name}}` is missing sibling file(s): {{missing}}. Scaffold the folder with `pnpm new:component`.',
    },
  },
  defaultOptions: [{ ignorePaths: [...DEFAULT_IGNORE_PATHS] }],
  create(context, [options]) {
    const ignorePaths = options.ignorePaths ?? DEFAULT_IGNORE_PATHS;
    const filename = context.filename;

    if (!isComponentEntryFile(filename) || isIgnoredPath(filename, ignorePaths)) {
      return {};
    }
    if (getFeatureName(filename) === null) {
      return {};
    }

    const name = getComponentName(filename);
    const dir = path.dirname(filename);
    const required = options.requiredSiblings ?? defaultRequiredSiblings(name);
    const missing = required.filter(sibling => !siblingExists(dir, sibling));

    return {
      Program(node): void {
        if (missing.length > 0) {
          context.report({
            node,
            messageId: 'missingSiblings',
            data: { name, missing: missing.join(', ') },
          });
        }
      },
    };
  },
});
