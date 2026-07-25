export interface IOverviewViewSkeletonView {
  /** Stable keys for the four stat-tile placeholders under the hero. */
  readonly statTileKeys: readonly number[];
  /** Stable keys for the recommendation shelf's "from your library" rows. */
  readonly libraryRowKeys: readonly number[];
  /** Stable keys for the recommendation shelf's "discover" rows. */
  readonly discoverRowKeys: readonly number[];
}
