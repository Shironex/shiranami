import type { Track } from '@/stores/types';

export interface IDragOverlayContentProps {
  /** The track currently being dragged, rendered as the floating preview. */
  readonly track: Track;
}

export interface IDragOverlayContentView {
  /** Track title shown on the preview's first line. */
  readonly title: string;
  /** Track artist shown on the preview's second line. */
  readonly artist: string;
  /** Cover art source, when the track has one. */
  readonly albumArt: string | undefined;
  /** Whether to render the cover image instead of the play-glyph fallback. */
  readonly hasAlbumArt: boolean;
  /** Formatted `m:ss` duration, or an empty string when the track has none. */
  readonly durationLabel: string;
}
