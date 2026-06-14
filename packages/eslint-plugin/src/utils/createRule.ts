import { ESLintUtils } from '@typescript-eslint/utils';

/**
 * Thin wrapper over RuleCreator that attaches a docs URL for this repo's
 * internal rules. The slug is cosmetic; it only surfaces in rule metadata.
 */
export const createRule = ESLintUtils.RuleCreator(
  ruleName =>
    `https://github.com/Shironex/shiranami/blob/master/packages/eslint-plugin/docs/rules/${ruleName}.md`
);
