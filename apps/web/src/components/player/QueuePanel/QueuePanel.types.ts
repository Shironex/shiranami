import type { ReactNode } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IQueuePanelProps {
  /** Optional control rendered at the right edge of the panel header. */
  readonly headerAction?: ReactNode;
}

/** A render-ready "Up Next" row carrying its absolute queue index + sortable id. */
export interface IQueueUpNextRow {
  /** Sortable id (encodes the absolute queue index to survive duplicate tracks). */
  readonly sortableId: string;
  /** The track to render. */
  readonly track: Track;
  /** Absolute index into the full queue. */
  readonly queueIndex: number;
}

export interface IQueuePanelView {
  /** Bound `queue` namespace translator. */
  readonly t: TranslateFn;
  /** Header action passed through from props. */
  readonly headerAction: ReactNode;
  /** Whether the queue has any entries (drives the empty state). */
  readonly hasQueue: boolean;
  /**
   * The track shown in the "Now Playing" block, or null when there is no
   * active track (the block is hidden). Pre-narrowed so the shell renders it
   * with a single guard.
   */
  readonly nowPlayingTrack: Track | null;
  /** Whether playback is active (drives the now-playing glyph). */
  readonly isPlaying: boolean;
  /** Index of the active track in the queue. */
  readonly queueIndex: number;
  /** Render-ready "Up Next" rows (everything after the active track). */
  readonly upNextRows: readonly IQueueUpNextRow[];
  /** Sortable ids for the dnd-kit context, in display order. */
  readonly sortableIds: string[];
  /** The track currently being dragged, for the drag overlay (null when idle). */
  readonly activeTrack: Track | null;
  /** dnd-kit sensors (pointer + keyboard). */
  readonly sensors: SensorDescriptor<SensorOptions>[];
  /** Whether the clear-queue confirm popover is open. */
  readonly showClearConfirm: boolean;
  /** Open/close the clear-queue confirm popover. */
  readonly onClearConfirmOpenChange: (open: boolean) => void;
  /** Confirm the destructive clear (empties the queue, closes the popover). */
  readonly onConfirmClear: () => void;
  /** Dismiss the confirm popover without clearing. */
  readonly onCancelClear: () => void;
  /** Play (or toggle) the track at the given queue index. */
  readonly onPlayIndex: (index: number) => void;
  /** Remove the track at the given queue index. */
  readonly onRemove: (e: React.MouseEvent, index: number) => void;
  /** dnd-kit drag-start handler. */
  readonly onDragStart: (event: DragStartEvent) => void;
  /** dnd-kit drag-end handler (commits the reorder). */
  readonly onDragEnd: (event: DragEndEvent) => void;
  /** dnd-kit drag-cancel handler. */
  readonly onDragCancel: () => void;
}
