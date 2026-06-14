import path from 'node:path';

import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';
import {
  getBasename,
  isIgnoredPath,
  isPascalCase,
  siblingExists,
} from '../utils/component-architecture';

export const RULE_NAME = 'index-must-reexport-default';

type MessageIds = 'missingDefaultReexport';

/*
 * The `index.ts` barrel in a component folder must re-export the component's
 * default export (`export { default as <Name> } from './<Name>'`) so consumers
 * import the folder, not the file. Only `index.ts` files that sit next to a
 * `<Folder>.tsx` of the same PascalCase name are checked, so non-component
 * barrels are untouched. `components/ui/**` is excluded.
 */
const DEFAULT_IGNORE_PATHS: readonly string[] = ['**/components/ui/**'];

function reexportsDefault(node: TSESTree.ExportNamedDeclaration): boolean {
  if (node.source === null) {
    return false;
  }
  return node.specifiers.some(
    specifier =>
      specifier.local.type === AST_NODE_TYPES.Identifier && specifier.local.name === 'default'
  );
}

export const indexMustReexportDefaultRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        "A component folder's `index.ts` must re-export the component default (`export { default as <Name> } from './<Name>'`).",
    },
    schema: [],
    messages: {
      missingDefaultReexport:
        "`index.ts` must re-export the {{name}} default: `export { default as {{name}} } from './{{name}}'`.",
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename;
    if (getBasename(filename) !== 'index.ts' || isIgnoredPath(filename, DEFAULT_IGNORE_PATHS)) {
      return {};
    }

    const dir = path.dirname(filename);
    const folderName = path.basename(dir);
    if (!isPascalCase(folderName) || !siblingExists(dir, `${folderName}.tsx`)) {
      return {};
    }

    let hasDefaultReexport = false;

    return {
      ExportNamedDeclaration(node): void {
        if (reexportsDefault(node)) {
          hasDefaultReexport = true;
        }
      },
      'Program:exit'(node): void {
        if (!hasDefaultReexport) {
          context.report({
            node,
            messageId: 'missingDefaultReexport',
            data: { name: folderName },
          });
        }
      },
    };
  },
});
