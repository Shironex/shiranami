import { formatDuration } from '@shiranami/shared';
import type { IDragOverlayContentProps, IDragOverlayContentView } from './DragOverlayContent.types';

/**
 * The overlay is a purely presentational preview of the dragged row; the hook
 * unpacks the track and resolves the two rendering branches — cover art vs. the
 * play-glyph fallback, and the duration label (blank for a zero-duration track,
 * which is how a not-yet-probed file arrives) — so the shell stays logic-free.
 */
export function useDragOverlayContent({
  track,
}: IDragOverlayContentProps): IDragOverlayContentView {
  return {
    title: track.title,
    artist: track.artist,
    albumArt: track.albumArt,
    hasAlbumArt: Boolean(track.albumArt),
    durationLabel: track.duration > 0 ? formatDuration(track.duration) : '',
  };
}
