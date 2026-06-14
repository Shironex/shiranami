import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { createRule } from '../utils/createRule';
import { isComponentFileName } from '../utils/component-architecture';

export const RULE_NAME = 'props-must-be-visual';

export interface PropsMustBeVisualOptions {
  readonly denyPatterns?: readonly string[];
}

type RuleOptions = [PropsMustBeVisualOptions];
type MessageIds = 'nonVisualProp';

/*
 * Component props describe what to render, not who is acting or what secret to
 * use. Names that look like auth/business identity (`userId`, `currentUser`,
 * `sessionId`) or secrets at rest (`token`, `jwt`, `secret`, `apiKey`) are
 * flagged: pass derived/display values instead, and read identity/secrets in the
 * hook. A live `password` typed into a form is a legitimate visual input (a
 * strength meter must receive it), so it is not on the denylist. Checked against
 * members of any `*Props` interface in a component file.
 */
const DEFAULT_DENY_PATTERNS: readonly string[] = [
  '^userId$',
  '^userIds$',
  '^currentUser',
  '^sessionId$',
  'token',
  'jwt',
  'secret',
  'apiKey',
  'credential',
];

const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    denyPatterns: { type: 'array', items: { type: 'string' }, uniqueItems: true },
  },
};

function isPropsInterface(name: string): boolean {
  return /Props$/.test(name);
}

function propertyName(member: TSESTree.TypeElement): string | null {
  if (
    member.type === AST_NODE_TYPES.TSPropertySignature &&
    member.key.type === AST_NODE_TYPES.Identifier
  ) {
    return member.key.name;
  }
  return null;
}

export const propsMustBeVisualRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Component props must be visual. Auth/business-identity and credential prop names (`userId`, `currentUser`, `*token*`, `*jwt*`, `password`, ...) are disallowed.',
    },
    schema: [optionSchema],
    messages: {
      nonVisualProp:
        'Prop `{{prop}}` looks like auth/business logic, not a visual concern. Pass a derived/display value and read identity or secrets in the hook.',
    },
  },
  defaultOptions: [{ denyPatterns: [...DEFAULT_DENY_PATTERNS] }],
  create(context, [options]) {
    if (!isComponentFileName(context.filename)) {
      return {};
    }
    const patterns = (options.denyPatterns ?? DEFAULT_DENY_PATTERNS).map(
      source => new RegExp(source, 'i')
    );

    function isDenied(name: string): boolean {
      return patterns.some(pattern => pattern.test(name));
    }

    return {
      TSInterfaceDeclaration(node): void {
        if (!isPropsInterface(node.id.name)) {
          return;
        }
        for (const member of node.body.body) {
          const name = propertyName(member);
          if (name !== null && isDenied(name)) {
            context.report({ node: member, messageId: 'nonVisualProp', data: { prop: name } });
          }
        }
      },
    };
  },
});
