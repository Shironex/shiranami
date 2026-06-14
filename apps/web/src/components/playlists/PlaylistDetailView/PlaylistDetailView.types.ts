import type { useTranslation } from 'react-i18next';
import type { DragStartEvent, DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import type { Playlist } from '@/types/electron';
import type { Track } from '@/stores/types';
import type { usePlaylistCover } from '@/hooks/usePlaylistCover';

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type PlaylistCover = ReturnType<typeof usePlaylistCover>;

export interface IPlaylistDetailViewView {
  /** Bound `playlists` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Bound `common` namespace translator for shared labels (retry). */
  readonly tCommon: TranslateFn;
  /** First load is in flight — show the spinner. */
  readonly isLoading: boolean;
  /** Query failed — show the error state with retry. */
  readonly isError: boolean;
  /** Loaded but the playlist was not found. */
  readonly notFound: boolean;
  /** The loaded playlist, or null while loading / not found. */
  readonly playlist: Playlist | null;
  /** Currently-open playlist id. */
  readonly selectedPlaylistId: string | null;
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
  /** Number of tracks. */
  readonly trackCount: number;
  /** Whether the playlist has any tracks. */
  readonly hasTracks: boolean;
  /** Total duration of all tracks, in seconds. */
  readonly totalDuration: number;
  /** A track's album art, offered as a one-click cover suggestion. */
  readonly suggestedCoverArt?: string;
  /** Cover-art menu controller from `usePlaylistCover`. */
  readonly cover: PlaylistCover;
  /** dnd-kit sensors for pointer + keyboard dragging. */
  readonly sensors: SensorDescriptor<SensorOptions>[];
  /** Whether any tracks are selected — toggles the bulk action bar. */
  readonly hasSelection: boolean;
  /** Whether the name is in inline-edit mode. */
  readonly isEditing: boolean;
  /** Current value of the inline name editor. */
  readonly editName: string;
  /** Update the inline name editor value. */
  readonly setEditName: (name: string) => void;
  /** Ref focused when inline editing begins. */
  readonly nameInputRef: React.RefObject<HTMLInputElement | null>;
  /** Whether the delete-confirmation popover is open. */
  readonly showDeleteConfirm: boolean;
  /** Controls the delete-confirmation popover. */
  readonly setShowDeleteConfirm: (show: boolean) => void;
  /** Retry loading after an error. */
  readonly onRetry: () => void;
  /** Navigate back to the playlists grid. */
  readonly onBack: () => void;
  /** Play the whole playlist from the top. */
  readonly onPlayAll: () => void;
  /** Play a track at the given index. */
  readonly onPlayTrack: (index: number) => void;
  /** Toggle a track's favorite state. */
  readonly onToggleFavorite: (trackId: string) => void;
  /** Remove a track from the playlist. */
  readonly onRemoveTrack: (trackId: string) => void;
  /** Delete the playlist. */
  readonly onDelete: () => void;
  /** Remove the current selection from the playlist (bulk). */
  readonly onBulkRemoveFromPlaylist: (trackIds: string[]) => void;
  /** Enter inline name-edit mode. */
  readonly onStartEdit: () => void;
  /** Commit the inline name edit. */
  readonly onSaveName: () => void;
  /** Keydown handler for the inline name editor (Enter saves, Escape cancels). */
  readonly onNameKeyDown: (e: React.KeyboardEvent) => void;
  /** Drag-start handler. */
  readonly onDragStart: (event: DragStartEvent) => void;
  /** Drag-end handler (commits the reorder). */
  readonly onDragEnd: (event: DragEndEvent) => void;
  /** Drag-cancel handler. */
  readonly onDragCancel: () => void;
}
