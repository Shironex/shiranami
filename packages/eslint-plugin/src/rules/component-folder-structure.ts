import { readdirSync } from 'node:fs';
import path from 'node:path';

import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { createRule } from '../utils/createRule';
import {
  getComponentName,
  getFeatureName,
  isComponentEntryFile,
  isIgnoredPath,
  isNestedComponentFile,
} from '../utils/component-architecture';

export const RULE_NAME = 'component-folder-structure';

export interface ComponentFolderStructureOptions {
  readonly ignorePaths?: readonly string[];
  readonly requiredSiblings?: readonly string[];
}

type RuleOptions = [ComponentFolderStructureOptions];
type MessageIds = 'missingSiblings' | 'notInOwnFolder';

/*
 * Every component under `components/<feature>/` lives in a folder of its own.
 * Two shapes violate that, and the rule reports each with its own message:
 *
 * - An entry file (`<Name>/<Name>.tsx`) whose sibling set is incomplete on disk
 *   — logic, types, story, and test must travel with the component. The default
 *   set is the colocated `.hooks.ts`, `.types.ts`, `.stories.tsx`, `.test.tsx`,
 *   and the `index.ts` barrel.
 * - A component file that is not an entry file at all: a sub-component dropped
 *   into another component's folder (`BulkActionBar/MoreMenu.tsx`) or a loose
 *   `.tsx` at a feature root (`splash/SplashRain.tsx`). Gating only on the entry
 *   shape made these invisible to the rule, which is how they accumulate.
 *
 * `components/ui/**` keeps the lighter shadcn convention and is excluded from
 * both checks via `ignorePaths`.
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
        'A component under `components/<feature>/` must live at `<Name>/<Name>.tsx` with its sibling set (`.hooks.ts`, `.types.ts`, `.stories.tsx`, `.test.tsx`, `index.ts`) present on disk.',
    },
    schema: [optionSchema],
    messages: {
      missingSiblings:
        'Component `{{name}}` is missing sibling file(s): {{missing}}. Scaffold the folder with `pnpm new:component`.',
      notInOwnFolder:
        'Component `{{name}}` is not in its own folder. Move it to `{{name}}/{{name}}.tsx` alongside its sibling set ({{required}}). Scaffold the folder with `pnpm new:component`.',
    },
  },
  defaultOptions: [{ ignorePaths: [...DEFAULT_IGNORE_PATHS] }],
  create(context, [options]) {
    const ignorePaths = options.ignorePaths ?? DEFAULT_IGNORE_PATHS;
    const filename = context.filename;

    const isEntry = isComponentEntryFile(filename);
    const isNested = isNestedComponentFile(filename);

    if ((!isEntry && !isNested) || isIgnoredPath(filename, ignorePaths)) {
      return {};
    }
    if (getFeatureName(filename) === null) {
      return {};
    }

    const name = getComponentName(filename);
    const dir = path.dirname(filename);
    const required = options.requiredSiblings ?? defaultRequiredSiblings(name);

    // A component that is not the entry file of its own folder cannot have a
    // sibling set to check yet — the fix is the move, so report that instead of
    // listing siblings as "missing" from a folder it does not own.
    if (isNested) {
      return {
        Program(node): void {
          context.report({
            node,
            messageId: 'notInOwnFolder',
            data: { name, required: required.join(', ') },
          });
        },
      };
    }

    // Read the component directory once and test against the resulting set,
    // rather than a synchronous `existsSync` per required sibling. A
    // missing/unreadable dir yields an empty set, so every sibling is reported
    // missing — matching the per-file `existsSync` behavior.
    let present: ReadonlySet<string>;
    try {
      present = new Set(readdirSync(dir));
    } catch {
      present = new Set();
    }
    const missing = required.filter(sibling => !present.has(sibling));

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
