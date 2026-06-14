import { join } from 'node:path';

import { ESLint } from 'eslint';

import type { IMetaContext, IMetaRule, IViolation } from '../../types';

const RULE_ID = 'eslint-config-no-warn';
const CONFIG_BASENAME = 'eslint.config.mjs';

/*
 * Shiranami lints from a single root flat config (no per-package configs), so
 * probe the resolved config at the root for the file shapes ESLint actually
 * lints. calculateConfigForFile does pure glob matching, so the files need not
 * exist; these shapes cover plain source (.ts/.tsx), the renderer (apps/web)
 * where the react block applies, and test files (where no-focused-tests is
 * scoped). A 'warn' anywhere in any resolved block surfaces through at least one
 * probe.
 */
const PROBE_RELATIVE_PATHS = [
  'packages/shared/src/__lint_meta_probe__.ts',
  'apps/web/src/__lint_meta_probe__.ts',
  'apps/web/src/__lint_meta_probe__.tsx',
  'apps/web/src/__lint_meta_probe__.test.ts',
  'apps/web/src/__lint_meta_probe__.test.tsx',
  'apps/desktop/src/main/__lint_meta_probe__.ts',
] as const;

/** Normalize an ESLint severity (number | string | [severity, ...opts]) to 0/1/2. */
function severityToNumber(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 1 || raw === 'warn') {
    return 1;
  }
  if (raw === 2 || raw === 'error') {
    return 2;
  }
  return 0;
}

export async function checkEslintConfigNoWarn(root: string): Promise<IViolation[]> {
  // A single instance rooted at the repo root resolves the one flat config.
  const eslint = new ESLint({ cwd: root, errorOnUnmatchedPattern: false });

  const warnRules = new Set<string>();
  const failedProbes: { probe: string; error: unknown }[] = [];

  for (const probe of PROBE_RELATIVE_PATHS) {
    try {
      const config = await eslint.calculateConfigForFile(join(root, probe));
      const rules = config.rules ?? {};
      for (const [ruleId, value] of Object.entries(rules)) {
        if (severityToNumber(value) === 1) {
          warnRules.add(ruleId);
        }
      }
    } catch (error) {
      failedProbes.push({ probe, error });
    }
  }

  // Fail closed: surface EVERY probe that failed to resolve, not only the case
  // where all of them failed. Each probe covers a distinct file shape (test
  // files, the react renderer, etc.), so a single failed probe means any "warn"
  // scoped to that shape would be silently missed — exactly the false negative
  // this check exists to prevent.
  const failures: IViolation[] = failedProbes.map(({ probe, error }) => ({
    file: join(root, CONFIG_BASENAME),
    rule: RULE_ID,
    message: `Could not resolve the effective ESLint config for the "${probe}" file shape (run \`pnpm --filter @shiranami/eslint-plugin build\` so the plugin dist exists): ${String(error)}`,
  }));

  const warnings: IViolation[] = [...warnRules].sort().map(ruleId => ({
    file: join(root, CONFIG_BASENAME),
    rule: RULE_ID,
    message: `Rule "${ruleId}" resolves to "warn". ESLint severities must be "error" or "off", never "warn" (this is the RESOLVED severity, so it may come from a spread preset, not a literal in the config file). Override it explicitly.`,
  }));

  return [...failures, ...warnings];
}

/**
 * ESLint config severities must be error or off, never warn.
 *
 * Evaluates the RESOLVED flat config via ESLint's `calculateConfigForFile`, so
 * a severity injected by a spread preset object (e.g. a recommended preset that
 * ships rules at `warn`) is caught even though no literal `"warn"` string
 * appears in the config file. Async because the ESLint config-resolution API is
 * async.
 */
export const eslintConfigNoWarnRule: IMetaRule = {
  id: RULE_ID,
  category: 'config',
  description: 'ESLint severities must be "error" or "off", not "warn".',
  runAsync({ root }: IMetaContext): Promise<IViolation[]> {
    return checkEslintConfigNoWarn(root);
  },
};
