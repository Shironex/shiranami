/*
 * Categories trimmed to what this repo's meta-lint actually uses. The template's
 * Drizzle/Elysia/CI-specific categories are intentionally dropped for Chunk 0.
 */
export type MetaRuleCategory = 'config' | 'source-text' | 'supply-chain' | 'ci' | 'testing';

export interface IViolation {
  readonly file: string;
  readonly rule: string;
  readonly message: string;
}

export interface IMetaContext {
  readonly root: string;
  readonly sourceFiles: readonly string[];
  readonly workflowFiles: readonly string[];
}

export interface IMetaRule {
  readonly id: string;
  readonly category: MetaRuleCategory;
  readonly description: string;
  readonly ciCritical?: boolean;
  /*
   * Backlog rules surface their findings but do NOT fail the build. Used for
   * pre-existing, intentional debt (load-bearing suppressions) that should be
   * visible but not block CI until the backlog is burned down.
   */
  readonly backlog?: boolean;
  // A rule provides `run` (sync), `runAsync` (async), or both. Both passes run
  // on every `pnpm lint:meta` invocation; a rule that needs ESLint's resolved
  // config (eslint-config-no-warn) is async-only.
  run?: (ctx: IMetaContext) => IViolation[];
  runAsync?: (ctx: IMetaContext) => Promise<IViolation[]>;
}
