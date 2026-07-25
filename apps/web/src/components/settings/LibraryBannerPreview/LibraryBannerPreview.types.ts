export interface ILibraryBannerPreviewProps {
  /** Whether the library hero banner is shown above the grid. */
  readonly enabled: boolean;
}

export interface ILibraryBannerPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether the library hero banner is shown above the grid. */
  readonly enabled: boolean;
}
