/**
 * FavoritesViewSkeleton takes no inputs — it is the fixed placeholder list the
 * favorites view shows before the library hydrates — so its props surface is
 * intentionally empty and exists to keep the per-component contract consistent.
 */
export interface IFavoritesViewSkeletonProps {}

export interface IFavoritesViewSkeletonView {
  /** Stable key per placeholder row, one screenful of the favorites list. */
  readonly rowKeys: readonly string[];
}
