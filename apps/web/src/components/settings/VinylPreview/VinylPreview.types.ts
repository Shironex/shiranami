export interface IVinylPreviewProps {
  /** Whether the vinyl record display is enabled. */
  readonly enabled: boolean;
}

export interface IVinylPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether the vinyl record display is enabled. */
  readonly enabled: boolean;
}
