/**
 * HistoryViewSkeleton takes no inputs — it is the fixed placeholder the history
 * dashboard shows while its query is in flight — so its props surface is
 * intentionally empty and exists to keep the per-component contract consistent.
 */
export interface IHistoryViewSkeletonProps {}

export interface IHistoryViewSkeletonView {
  /** Stable key per hero range pill. */
  readonly heroPillKeys: readonly string[];
  /** Stable key per summary stat card. */
  readonly statCardKeys: readonly string[];
  /** Stable key per row inside a top-tracks/top-artists panel. */
  readonly panelRowKeys: readonly string[];
  /** Stable key per side-by-side list panel. */
  readonly listPanelKeys: readonly string[];
  /** Stable key per recent-plays row. */
  readonly recentRowKeys: readonly string[];
}
