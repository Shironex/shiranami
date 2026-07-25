export interface INowPlayingViewPreviewProps {
  /** Whether the immersive Now Playing view is enabled. */
  readonly enabled: boolean;
}

export interface INowPlayingViewPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether the immersive Now Playing view is enabled. */
  readonly enabled: boolean;
}
