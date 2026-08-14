export interface ISidePanelSkeletonView {
  /** Stable keys for the placeholder rows filling the panel while a chunk loads. */
  readonly rowKeys: readonly number[];
}
