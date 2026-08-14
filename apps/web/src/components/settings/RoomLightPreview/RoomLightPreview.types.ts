import type { CSSProperties } from 'react';

export interface IRoomLightPreviewProps {
  /** Whether the time-of-day lighting grade is enabled. */
  readonly enabled: boolean;
}

export interface IRoomLightPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /**
   * The `--room-light-*` variables for the configured stop, intensity and hue
   * nudge — `null` while the effect is off, which unmounts the layer exactly
   * like AmbientBackground does.
   */
  readonly layerStyle: CSSProperties | null;
  /** Localized status line: the shown stop and intensity, or the off state. */
  readonly statusLabel: string;
}
