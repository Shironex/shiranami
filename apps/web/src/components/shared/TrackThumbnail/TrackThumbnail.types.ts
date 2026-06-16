import type { ReactNode } from 'react';

export interface ITrackThumbnailProps {
  /** Album art URL; renders the fallback when absent. */
  readonly albumArt?: string | null;
  /** `alt` for the cover image. */
  readonly alt: string;
  /** Node shown when there's no album art (icon, EqBars, etc.). */
  readonly fallback: ReactNode;
  /**
   * When true, render only the `<img>`/fallback so the caller can supply its
   * own (animated / clickable) wrapper element. The image fills the parent.
   * When false (default), wrap in a centered, overflow-hidden box styled by
   * `className`.
   */
  readonly fill?: boolean;
  /** Classes for the wrapper box (size/rounding/background). Ignored when `fill`. */
  readonly className?: string;
  /** Extra classes merged onto the `<img>`. */
  readonly imgClassName?: string;
}

export interface ITrackThumbnailView {
  /** The image-or-fallback node, ready to render inside the optional wrapper. */
  readonly inner: ReactNode;
  /** When true, render `inner` bare; otherwise wrap it in the styled box. */
  readonly fill: boolean;
  /** Classes for the wrapper box. */
  readonly className: string | undefined;
}
