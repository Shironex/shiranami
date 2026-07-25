/**
 * LibraryViewSkeleton takes no inputs — it is the fixed placeholder the library
 * shows before the track list hydrates — so its props surface is intentionally
 * empty and exists to keep the per-component contract consistent.
 */
export interface ILibraryViewSkeletonProps {}

export interface ILibraryViewSkeletonView {
  /** Stable key per placeholder row, one screenful of the track list. */
  readonly rowKeys: readonly string[];
}
