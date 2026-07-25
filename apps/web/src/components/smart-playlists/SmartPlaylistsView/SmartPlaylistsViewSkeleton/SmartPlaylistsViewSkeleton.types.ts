export interface ISmartPlaylistsViewSkeletonView {
  /** Localized page title, used by the header and the screen-reader status line. */
  readonly title: string;
  /** Stable keys for the placeholder cards filling the grid while the list loads. */
  readonly placeholderKeys: readonly number[];
}
