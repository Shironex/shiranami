import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { isEmptyStringLiteral } from '../utils/ast';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'no-error-stringify';

export interface NoErrorStringifyOptions {
  readonly errorIdentifierNames?: readonly string[];
}

type RuleOptions = [NoErrorStringifyOptions];
type MessageIds = 'noErrorStringify';

const DEFAULT_ERROR_NAMES: readonly string[] = ['error', 'err', 'e', 'cause'];

/*
 * ADAPTED from BoringStack: this codebase already uses the guarded extractor
 * idiom `error instanceof Error ? error.message : String(error)` everywhere, so
 * banning bare `String(error)` would flag correct code. We flag only the
 * unambiguous cause-chain-dropping forms: a bare `${error}` interpolation,
 * `error.toString()`, and `error + ""`. The guarded ternary is the intended fix
 * and stays legal.
 */
const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    errorIdentifierNames: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      minItems: 1,
    },
  },
};

function isErrorIdentifier(
  node: TSESTree.Node,
  names: ReadonlySet<string>
): node is TSESTree.Identifier {
  return node.type === AST_NODE_TYPES.Identifier && names.has(node.name);
}

export const noErrorStringifyRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow stringifying an error with bare `${error}` interpolation, `error.toString()`, or `error + ""`. These drop the cause chain. Use `error instanceof Error ? error.message : String(error)` instead.',
    },
    schema: [optionSchema],
    messages: {
      noErrorStringify:
        'Stringifying an error this way drops its cause chain. Use `{{name}} instanceof Error ? {{name}}.message : String({{name}})` (or pass the Error object straight to the logger).',
    },
  },
  defaultOptions: [{ errorIdentifierNames: [...DEFAULT_ERROR_NAMES] }],
  create(context, [options]) {
    const errorNames = new Set(options.errorIdentifierNames ?? DEFAULT_ERROR_NAMES);

    function report(node: TSESTree.Node, name: string): void {
      context.report({ node, messageId: 'noErrorStringify', data: { name } });
    }

    return {
      // `error.toString()`
      'CallExpression[callee.type="MemberExpression"]'(node: TSESTree.CallExpression): void {
        const callee = node.callee as TSESTree.MemberExpression;
        if (
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'toString' &&
          node.arguments.length === 0 &&
          isErrorIdentifier(callee.object, errorNames)
        ) {
          report(node, callee.object.name);
        }
      },
      // bare `${error}` inside a template literal
      TemplateLiteral(node): void {
        for (const expr of node.expressions) {
          if (isErrorIdentifier(expr, errorNames)) {
            report(expr, expr.name);
          }
        }
      },
      // `error + ""` or `"" + error`
      BinaryExpression(node): void {
        if (node.operator !== '+') {
          return;
        }
        const sides = [node.left, node.right];
        if (!sides.some(isEmptyStringLiteral)) {
          return;
        }
        for (const side of sides) {
          if (isErrorIdentifier(side, errorNames)) {
            report(node, side.name);
            return;
          }
        }
      },
    };
  },
});
