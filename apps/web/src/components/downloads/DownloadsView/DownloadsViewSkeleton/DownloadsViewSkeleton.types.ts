/**
 * DownloadsViewSkeleton takes no inputs — it is the fixed placeholder frame the
 * downloads view shows before the first queue snapshot lands — so its props
 * surface is intentionally empty and exists to keep the per-component contract
 * consistent.
 */
export interface IDownloadsViewSkeletonProps {}

export interface IDownloadsViewSkeletonSection {
  /** Stable key for the placeholder section group. */
  readonly key: string;
  /** Stable key per placeholder queue row within the group. */
  readonly rowKeys: readonly string[];
}

export interface IDownloadsViewSkeletonView {
  /** Placeholder section groups mirroring the Active / Queued queue layout. */
  readonly sections: readonly IDownloadsViewSkeletonSection[];
}
