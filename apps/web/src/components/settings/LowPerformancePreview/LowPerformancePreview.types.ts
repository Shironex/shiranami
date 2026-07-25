export interface ILowPerformancePreviewProps {
  /** Whether low-performance mode is on (rendering is reduced). */
  readonly enabled: boolean;
}

export interface ILowPerformancePreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether low-performance mode is on (rendering is reduced). */
  readonly enabled: boolean;
  /** Localized status line describing the current rendering mode. */
  readonly statusLabel: string;
  /** Localized badge label (`Reduced` / `Full`). */
  readonly badgeLabel: string;
  /** Fixed bar heights (px) for the equalizer mock. */
  readonly barHeights: readonly number[];
}
