import type { useTranslation } from 'react-i18next';
import type { DragStartEvent, DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import type { Track } from '@/stores/types';
import type { IVirtualSortableTrackRowProps } from '../VirtualSortableTrackRow';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPlaylistTrackListProps {
  /** Tracks in display order (favorite overlay applied). */
  readonly displayTracks: Track[];
  /** Stable id list for the dnd-kit `SortableContext`. */
  readonly sortableIds: string[];
  /** The track being dragged, rendered in the drag overlay, or null. */
  readonly activeTrack: Track | null;
  /** The currently-playing track, used to highlight the active row. */
  readonly currentTrack: Track | null;
  /** Whether playback is active. */
  readonly isPlaying: boolean;
  /** dnd-kit sensors for pointer + keyboard dragging. */
  readonly sensors: SensorDescriptor<SensorOptions>[];
  /** Drag-start handler. */
  readonly onDragStart: (event: DragStartEvent) => void;
  /** Drag-end handler (commits the reorder). */
  readonly onDragEnd: (event: DragEndEvent) => void;
  /** Drag-cancel handler. */
  readonly onDragCancel: () => void;
  /** Start playback at the given index. */
  readonly onPlayTrack: (index: number) => void;
  /** Toggle a track's favorite state. */
  readonly onToggleFavorite: (trackId: string) => void;
  /** Remove a track from the playlist. */
  readonly onRemoveTrack: (trackId: string) => void;
}

export interface IPlaylistTrackListView {
  /** Bound `playlists` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** No tracks to show — renders the detail empty state. */
  readonly isEmpty: boolean;
  /** Per-row props passed once to react-window; rows re-render on identity change. */
  readonly rowProps: IVirtualSortableTrackRowProps;
}
