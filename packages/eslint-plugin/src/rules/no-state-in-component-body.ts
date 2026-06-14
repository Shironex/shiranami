import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';

import { createRule } from '../utils/createRule';
import { isComponentEntryFile } from '../utils/component-architecture';

export const RULE_NAME = 'no-state-in-component-body';

export interface NoStateInComponentBodyOptions {
  readonly allowedHooks?: readonly string[];
  readonly additionalHooks?: readonly string[];
  readonly storeHookPattern?: string;
}

type RuleOptions = [NoStateInComponentBodyOptions];
type MessageIds = 'stateInBody';

/*
 * State, effect, and query logic belongs in the colocated `<Name>.hooks.ts`,
 * not in the component entry file (`<Name>.tsx`), which should be a thin
 * presentation shell. React state/effect/memo/ref hooks, react-query data
 * hooks, and zustand store hooks (`use*Store`) are flagged. `useId`,
 * `useTransition`, and `useDeferredValue` are render-safe and allowlisted.
 * Only `<Name>.tsx` files are checked; `.hooks.ts` is the correct home.
 */
const DEFAULT_ALLOWED: readonly string[] = ['useId', 'useTransition', 'useDeferredValue'];

const REACT_STATEFUL_HOOKS: readonly string[] = [
  'useState',
  'useReducer',
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useImperativeHandle',
];

const REACT_QUERY_HOOKS: readonly string[] = [
  'useQuery',
  'useMutation',
  'useInfiniteQuery',
  'useSuspenseQuery',
  'useQueries',
];

const DEFAULT_STORE_PATTERN = '^use[A-Z][A-Za-z0-9]*Store$';

const optionSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    allowedHooks: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    additionalHooks: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    storeHookPattern: { type: 'string' },
  },
};

export const noStateInComponentBodyRule = createRule<RuleOptions, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'State/effect/query hooks must live in the colocated `<Name>.hooks.ts`, not in the component `.tsx` body. The component is a thin shell.',
    },
    schema: [optionSchema],
    messages: {
      stateInBody:
        '`{{hook}}` must live in `<Name>.hooks.ts`, not the component body. Move state/effect/query logic into the colocated hook.',
    },
  },
  defaultOptions: [{ allowedHooks: [...DEFAULT_ALLOWED] }],
  create(context, [options]) {
    if (!isComponentEntryFile(context.filename)) {
      return {};
    }

    const allowed = new Set(options.allowedHooks ?? DEFAULT_ALLOWED);
    const storePattern = new RegExp(options.storeHookPattern ?? DEFAULT_STORE_PATTERN);
    const flagged = new Set<string>([
      ...REACT_STATEFUL_HOOKS,
      ...REACT_QUERY_HOOKS,
      ...(options.additionalHooks ?? []),
    ]);

    function isFlaggedHook(name: string): boolean {
      if (allowed.has(name)) {
        return false;
      }
      return flagged.has(name) || storePattern.test(name);
    }

    return {
      CallExpression(node: TSESTree.CallExpression): void {
        if (node.callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        const name = node.callee.name;
        if (isFlaggedHook(name)) {
          context.report({ node: node.callee, messageId: 'stateInBody', data: { hook: name } });
        }
      },
    };
  },
});
