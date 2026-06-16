import type { ReactNode } from 'react';
import type { Track } from '@/stores/types';
import type { ContextMenuPosition } from '@/components/shared/TrackContextMenu';

export interface ITrackRowContentProps {
  readonly track: Track;
  readonly index: number;
  readonly queue: Track[];
  readonly currentTrack: Track | null;
  readonly isPlaying: boolean;
  readonly handlePlayTrack: (index: number) => void;
  readonly onToggleFavorite?: (trackId: string) => void;
  readonly onRemoveFromPlaylist?: (trackId: string) => void;
  readonly showAddToPlaylist?: boolean;
  readonly compact?: boolean;
  readonly dragHandle?: ReactNode;
}

export interface ITrackRowContentView {
  /** Translator bound to the `contextMenu` namespace. */
  readonly t: (key: string, options?: Record<string, unknown>) => string;
  /** Open context-menu position, or null when closed. */
  readonly contextMenu: ContextMenuPosition | null;
  /** Whether this row is part of the active selection. */
  readonly isSelected: boolean;
  /** Whether this row's track is the currently playing track. */
  readonly isActive: boolean;
  /** Effective favorite flag (row overlay value, falling back to the seed track). */
  readonly isFavorite: boolean;
  /** Right-click handler that positions (or clears + positions) the context menu. */
  readonly handleContextMenu: (e: React.MouseEvent) => void;
  /** Closes the context menu. */
  readonly handleCloseContextMenu: () => void;
  /** Row click — selection modifiers (cmd/shift) or play. */
  readonly handleClick: (e: React.MouseEvent) => void;
}
