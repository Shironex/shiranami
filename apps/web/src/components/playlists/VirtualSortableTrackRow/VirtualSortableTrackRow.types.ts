import type { CSSProperties } from 'react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { Track } from '@/stores/types';

/**
 * Per-row props passed to every virtualized row via react-window's `rowProps`.
 * The shell receives these merged with react-window's `index` + `style` as
 * `RowComponentProps<IVirtualSortableTrackRowProps>`.
 */
export interface IVirtualSortableTrackRowProps {
  /** Tracks in display order — the full list, indexed by react-window's `index`. */
  readonly tracks: Track[];
  /** The currently-playing track, used to highlight the active row. */
  readonly currentTrack: Track | null;
  /** Whether playback is active, used to render the play/pause glyph. */
  readonly isPlaying: boolean;
  /** Start playback at the given index. */
  readonly onPlayTrack: (index: number) => void;
  /** Toggle a track's favorite state. */
  readonly onToggleFavorite: (trackId: string) => void;
  /** Remove a track from the playlist. */
  readonly onRemoveTrack: (trackId: string) => void;
}

export interface IVirtualSortableTrackRowView {
  /** The track this row renders, resolved from `tracks[index]`. */
  readonly track: Track;
  /** The full queue, forwarded to the shared row content. */
  readonly tracks: Track[];
  /** react-window's row index. */
  readonly index: number;
  /** The currently-playing track. */
  readonly currentTrack: Track | null;
  /** Whether playback is active. */
  readonly isPlaying: boolean;
  /** Inline style react-window assigns for absolute positioning. */
  readonly style: CSSProperties | undefined;
  /** Composed sortable transform style applied to the inner reorder element. */
  readonly sortableStyle: CSSProperties;
  /** dnd-kit node ref for the sortable inner element. */
  readonly setNodeRef: (node: HTMLElement | null) => void;
  /** dnd-kit attributes spread on the sortable inner element. */
  readonly attributes: DraggableAttributes;
  /** dnd-kit listeners spread on the drag-handle button. */
  readonly listeners: DraggableSyntheticListeners;
  /** Accessible label / aria-label for the drag-handle button. */
  readonly dragLabel: string;
  /** Start playback at this row's index. */
  readonly onPlayTrack: (index: number) => void;
  /** Toggle this row's track favorite state. */
  readonly onToggleFavorite: (trackId: string) => void;
  /** Remove this row's track from the playlist. */
  readonly onRemoveTrack: (trackId: string) => void;
}
