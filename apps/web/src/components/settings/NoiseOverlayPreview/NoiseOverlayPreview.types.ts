export interface INoiseOverlayPreviewProps {
  /** Whether the grain/noise texture is layered over app surfaces. */
  readonly enabled: boolean;
}

export interface INoiseOverlayPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether the grain/noise texture layer is drawn. */
  readonly showNoiseLayer: boolean;
  /** Localized status line describing the current texture state. */
  readonly statusLabel: string;
}
