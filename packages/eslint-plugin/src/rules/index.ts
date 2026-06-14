import { interfacePrefixIRule } from './interface-prefix-i';
import { noBareDateNowRule } from './no-bare-date-now';
import { noDirectProcessEnvRule } from './no-direct-process-env';
import { noErrorStringifyRule } from './no-error-stringify';
import { noFocusedTestsRule } from './no-focused-tests';
import { noHistoricalCommentsRule } from './no-historical-comments';
import { noNarrationCommentsRule } from './no-narration-comments';
import { noPrReferenceCommentsRule } from './no-pr-reference-comments';
import { noProcessExitRule } from './no-process-exit';
import { noTemplateTrimEmptyTernaryRule } from './no-template-trim-empty-ternary';
import { preferEarlyReturnRule } from './prefer-early-return';
import { propsMustBeVisualRule } from './props-must-be-visual';

export const rules = {
  // Comment hygiene.
  'no-historical-comments': noHistoricalCommentsRule,
  'no-narration-comments': noNarrationCommentsRule,
  'no-pr-reference-comments': noPrReferenceCommentsRule,
  // Test hygiene.
  'no-focused-tests': noFocusedTestsRule,
  // General correctness.
  'no-error-stringify': noErrorStringifyRule,
  'no-template-trim-empty-ternary': noTemplateTrimEmptyTernaryRule,
  // Frontend component architecture.
  'props-must-be-visual': propsMustBeVisualRule,
  // Electron-safe process boundary.
  'no-process-exit': noProcessExitRule,
  // Dormant rules: registered but shipped 'off' in recommended (high churn or
  // missing prerequisite). Enable per-repo once the tree is clean — the no-warn
  // policy forbids a 'warn' rollout.
  'prefer-early-return': preferEarlyReturnRule,
  'interface-prefix-i': interfacePrefixIRule,
  'no-direct-process-env': noDirectProcessEnvRule,
  'no-bare-date-now': noBareDateNowRule,
};
