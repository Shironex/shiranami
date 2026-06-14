import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

export const RULE_NAME = 'interface-prefix-i';

type MessageIds = 'missingPrefix';

/*
 * Interfaces are prefixed `I` followed by an uppercase letter (`IUserProfile`,
 * `ILoginFormProps`) so an interface reads as one at a glance and never collides
 * with a value of the same name. Interfaces inside an ambient `declare module` /
 * `declare global` block are augmentations whose names are dictated by the thing
 * being augmented (`Register`, `Window`) and are exempt. Report-only: a rename
 * touches every reference, which a single-file fixer cannot do safely.
 */
function isAlreadyPrefixed(name: string): boolean {
  return /^I[A-Z]/.test(name);
}

function isInsideAmbientModule(node: TSESTree.TSInterfaceDeclaration): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (current.type === AST_NODE_TYPES.TSModuleDeclaration) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export const interfacePrefixIRule = createRule<[], MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Interface names must be prefixed with `I` followed by an uppercase letter. Module/global augmentations are exempt.',
    },
    schema: [],
    messages: {
      missingPrefix:
        'Interface `{{name}}` must be prefixed with `I` (e.g. `I{{name}}`). Rename the declaration and its references.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      TSInterfaceDeclaration(node): void {
        const name = node.id.name;
        if (isAlreadyPrefixed(name) || isInsideAmbientModule(node)) {
          return;
        }
        context.report({ node: node.id, messageId: 'missingPrefix', data: { name } });
      },
    };
  },
});
