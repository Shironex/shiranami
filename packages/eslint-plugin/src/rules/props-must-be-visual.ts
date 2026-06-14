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

/**
 * Compile each `denyPatterns` source into a case-insensitive RegExp, turning a
 * malformed entry into a controlled, actionable config error (naming the bad
 * pattern) instead of an opaque SyntaxError that aborts the whole lint run.
 */
export function compileDenyPatterns(sources: readonly string[]): RegExp[] {
  return sources.map(source => {
    try {
      return new RegExp(source, 'i');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid \`denyPatterns\` entry for ${RULE_NAME}: ${JSON.stringify(source)} is not a valid regular expression (${reason}).`,
        { cause: error }
      );
    }
  });
}

export const propsMustBeVisualRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Component props must be visual. Auth/business-identity and credential prop names (`userId`, `currentUser`, `*token*`, `*jwt*`, `*secret*`, `apiKey`, ...) are disallowed. A live `password` input is a legitimate visual concern and is intentionally allowed.',
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
    const patterns = compileDenyPatterns(options.denyPatterns ?? DEFAULT_DENY_PATTERNS);

    function isDenied(name: string): boolean {
      return patterns.some(pattern => pattern.test(name));
    }

    function checkMembers(members: readonly TSESTree.TypeElement[]): void {
      for (const member of members) {
        const name = propertyName(member);
        if (name !== null && isDenied(name)) {
          context.report({ node: member, messageId: 'nonVisualProp', data: { prop: name } });
        }
      }
    }

    return {
      TSInterfaceDeclaration(node): void {
        if (!isPropsInterface(node.id.name)) {
          return;
        }
        checkMembers(node.body.body);
      },
      // `type XProps = { ... }` — an object type literal alias is a props surface
      // just like an interface.
      TSTypeAliasDeclaration(node): void {
        if (
          !isPropsInterface(node.id.name) ||
          node.typeAnnotation.type !== AST_NODE_TYPES.TSTypeLiteral
        ) {
          return;
        }
        checkMembers(node.typeAnnotation.members);
      },
    };
  },
});
