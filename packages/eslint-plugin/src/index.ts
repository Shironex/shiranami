import type { TSESLint } from '@typescript-eslint/utils';

import { recommendedRules } from './configs/recommended';
import { rules } from './rules';

type ShiranamiPlugin = TSESLint.FlatConfig.Plugin & {
  configs: Record<string, TSESLint.FlatConfig.Config>;
};

const plugin: ShiranamiPlugin = {
  meta: {
    name: '@shiranami/eslint-plugin',
    version: '0.0.0',
  },
  rules,
  configs: {},
};

// Short name `shiranami` so rules read like `shiranami/<rule-name>` in flat
// config.
plugin.configs.recommended = {
  plugins: {
    shiranami: plugin,
  },
  rules: recommendedRules,
};

export { rules };
export const configs = plugin.configs;
export default plugin;
