export interface IVinylPreviewProps {
  /** Whether the vinyl record display is enabled. */
  readonly enabled: boolean;
}

/** One live disc in the preview — a stage the vinyl display renders on. */
export interface IVinylPreviewStage {
  /** Stable id — also the `data-slot` suffix on the stage wrapper. */
  readonly id: 'now-playing' | 'sanctuary';
  /** Localized caption under the disc. */
  readonly caption: string;
  /** Disc diameter in px for the stage's size preference. */
  readonly px: number;
}

export interface IVinylPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether the vinyl record display is enabled. */
  readonly enabled: boolean;
  /** The two stage miniatures, each sized by its own preference. */
  readonly stages: readonly IVinylPreviewStage[];
  /** Cover of the playing track (null → brand-mark / black-face fallback). */
  readonly albumArt: string | null;
}
