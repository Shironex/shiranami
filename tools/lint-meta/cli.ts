/**
 * Static checks for files ESLint can't parse as JavaScript, plus a resolved-
 * config severity audit:
 *
 *   pnpm lint:meta
 *   pnpm lint:meta --list-rules
 *
 * Blocking violations exit non-zero. Backlog rules (pre-existing intentional
 * debt) are surfaced but never fail the build.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildContext } from './context';
import { META_RULES } from './registry';
import { printRuleCatalog, runMetaRules, runMetaRulesAsync } from './runner';
import type { IViolation } from './types';

const ROOT = resolve(process.cwd());

type Writer = (line: string) => void;

function printViolations(violations: readonly IViolation[], write: Writer): void {
  for (const v of violations) {
    write(`  ${v.file}`);
    write(`    ${v.rule}: ${v.message}\n`);
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--list-rules')) {
    printRuleCatalog(META_RULES);
    return;
  }

  const ctx = buildContext(ROOT);
  const backlogRuleIds = new Set(META_RULES.filter(rule => rule.backlog).map(rule => rule.id));

  const violations = [
    ...runMetaRules(META_RULES, ctx),
    ...(await runMetaRulesAsync(META_RULES, ctx)),
  ];

  const blocking = violations.filter(v => !backlogRuleIds.has(v.rule));
  const backlog = violations.filter(v => backlogRuleIds.has(v.rule));

  if (backlog.length > 0) {
    // Backlog is informational, not an error: write it to stdout so stderr is
    // reserved for actual blocking failures.
    console.log(`[lint:meta] ${String(backlog.length)} backlog violation(s) (non-blocking):\n`);
    printViolations(backlog, line => {
      console.log(line);
    });
  }

  if (blocking.length === 0) {
    console.log('[lint:meta] No blocking violations.');
    return;
  }

  console.error(`[lint:meta] ${String(blocking.length)} blocking violation(s):\n`);
  printViolations(blocking, line => {
    console.error(line);
  });

  process.exit(1);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
