import { eslintConfigNoWarnRule } from './rules/config/eslint-config-no-warn';
import { noInlineLintDisableRule, noTsIgnoreRule } from './rules/source-text/forbidden-text';
import {
  rustCommandPlacementRule,
  rustLayerRankRule,
  rustModuleShapeRule,
} from './rules/source-text/rust-architecture';
import type { IMetaRule } from './types';

export const META_RULES: readonly IMetaRule[] = [
  eslintConfigNoWarnRule,
  noInlineLintDisableRule,
  noTsIgnoreRule,
  rustModuleShapeRule,
  rustLayerRankRule,
  rustCommandPlacementRule,
];
