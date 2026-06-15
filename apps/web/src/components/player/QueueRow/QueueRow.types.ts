import type { ReactNode } from 'react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { Track } from '@/stores/types';

/** Minimal track shape rendered by a queue row body / drag overlay. */
export interface IQueueRowTrack {
  readonly title: string;
  readonly artist: string;
  readonly albumArt?: string;
  readonly duration: number;
}

/** Localized labels shared across the interactive queue rows. */
export interface IQueueRowLabels {
  /** Aria-label for the remove button. */
  readonly remove: string;
  /** Aria-label for the drag handle. */
  readonly dragToReorder: string;
  /** Sr-only "now playing" announcement for the active row. */
  readonly nowPlaying: string;
}

/** Props for the shared row body (thumbnail + title/artist + duration). */
export interface IQueueRowBodyProps {
  readonly track: IQueueRowTrack;
  readonly thumbnailFallback: ReactNode;
  readonly thumbnailClassName: string;
  readonly titleClassName?: string;
}

/** Props for the sortable "Up Next" row (default export). */
export interface ISortableQueueRowProps {
  readonly track: Track;
  readonly sortableId: string;
  readonly queueIndex: number;
  readonly onPlay: (queueIndex: number) => void;
  readonly onRemove: (e: React.MouseEvent, queueIndex: number) => void;
}

/** Props for the non-draggable "Now Playing" item. */
export interface IQueueItemProps {
  readonly track: {
    id: string;
    title: string;
    artist: string;
    albumArt?: string;
    duration: number;
  };
  readonly index: number;
  readonly isActive: boolean;
  readonly isPlaying: boolean;
  readonly onPlay: (index: number) => void;
  readonly onRemove: (e: React.MouseEvent, index: number) => void;
}

/** Props for the drag-overlay preview rendered while reordering. */
export interface IDragOverlayContentProps {
  readonly track: IQueueRowTrack;
}

/** View model for the sortable "Up Next" row. */
export interface ISortableQueueRowView {
  /** dnd-kit node ref for the sortable container. */
  readonly setNodeRef: (node: HTMLElement | null) => void;
  /** Inline transform/transition style applied to the row. */
  readonly style: React.CSSProperties;
  /** dnd-kit attributes spread on the drag handle. */
  readonly attributes: DraggableAttributes;
  /** dnd-kit listeners spread on the drag handle. */
  readonly listeners: DraggableSyntheticListeners;
  /** Whether the row is currently being dragged (dims the source). */
  readonly isDragging: boolean;
  /** Localized labels for the row controls. */
  readonly labels: IQueueRowLabels;
  /** Start playback for this row. */
  readonly onPlay: () => void;
  /** Remove this row from the queue. */
  readonly onRemove: (e: React.MouseEvent) => void;
}
