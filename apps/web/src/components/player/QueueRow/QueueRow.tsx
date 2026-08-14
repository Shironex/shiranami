import { memo } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { X, Play, Pause, GripVertical } from 'lucide-react';
import { EqBars } from '@/components/shared/EqBars';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { motion } from 'motion/react';
import { useSortableQueueRow, useQueueRowLabels } from './QueueRow.hooks';
import type {
  IQueueRowBodyProps,
  IQueueItemProps,
  IDragOverlayContentProps,
  ISortableQueueRowProps,
} from './QueueRow.types';

/* ── Shared queue-row body (thumbnail + title/artist + duration) ── */

function QueueRowBody({
  track,
  thumbnailFallback,
  thumbnailClassName,
  titleClassName,
}: IQueueRowBodyProps) {
  const durationLabel = track.duration > 0 ? formatDuration(track.duration) : '';
  return (
    <>
      <TrackThumbnail
        albumArt={track.albumArt}
        alt={track.title}
        imgClassName="rounded-md"
        className={thumbnailClassName}
        fallback={thumbnailFallback}
      />

      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-medium truncate', titleClassName)}>{track.title}</p>
        <p className="text-[10px] text-muted-foreground/50 truncate">{track.artist}</p>
      </div>

      <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
        {durationLabel}
      </span>
    </>
  );
}

/* ── Remove button shared by interactive rows ─────────────── */

function RemoveButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.75 }}
      onClick={onClick}
      className="shrink-0 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all duration-150"
      aria-label={ariaLabel}
    >
      <X className="w-3 h-3" />
    </motion.button>
  );
}

/* ── Sortable queue row (for Up Next items) — default export ── */

export default function SortableQueueRow(props: ISortableQueueRowProps) {
  const { track } = props;
  const { setNodeRef, style, attributes, listeners, isDragging, labels, onPlay, onRemove } =
    useSortableQueueRow(props);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-200 group cursor-pointer hover:bg-accent',
        isDragging && 'opacity-30'
      )}
      onClick={onPlay}
    >
      <button
        className="focus-ring shrink-0 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-muted-foreground/60 transition-all duration-150 cursor-grab active:cursor-grabbing touch-none"
        aria-label={labels.dragToReorder}
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3" />
      </button>

      <QueueRowBody
        track={track}
        thumbnailFallback={<Play className="w-3 h-3 text-muted-foreground/40" />}
        thumbnailClassName="w-8 h-8 rounded-md bg-surface"
      />

      <RemoveButton ariaLabel={labels.remove} onClick={onRemove} />
    </div>
  );
}

export { SortableQueueRow };

/* ── Now Playing item (not draggable) ──────────────────── */

export const QueueItem = memo(function QueueItem({
  track,
  index,
  isActive,
  isPlaying,
  onPlay,
  onRemove,
}: IQueueItemProps) {
  const labels = useQueueRowLabels();
  const fallback =
    isActive && isPlaying ? (
      <>
        <span className="sr-only">{labels.nowPlaying}</span>
        <EqBars size="sm" />
      </>
    ) : isActive ? (
      <Pause className="w-3 h-3 text-primary" />
    ) : (
      <Play className="w-3 h-3 text-muted-foreground/40" />
    );

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 group cursor-pointer',
        isActive ? 'bg-primary/[0.08]' : 'hover:bg-accent'
      )}
      onClick={() => onPlay(index)}
    >
      <QueueRowBody
        track={track}
        thumbnailFallback={fallback}
        thumbnailClassName={cn('w-8 h-8 rounded-md', isActive ? 'bg-primary/15' : 'bg-surface')}
        titleClassName={cn(isActive && 'text-primary')}
      />
      <RemoveButton
        ariaLabel={labels.remove}
        onClick={(e: React.MouseEvent) => onRemove(e, index)}
      />
    </div>
  );
});

/* ── Drag overlay content ──────────────────────────────── */

export function DragOverlayContent({ track }: IDragOverlayContentProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-accent text-foreground shadow-lg">
      <div className="shrink-0 p-0.5 text-muted-foreground/40">
        <GripVertical className="w-3 h-3" />
      </div>
      <QueueRowBody
        track={track}
        thumbnailFallback={<Play className="w-3 h-3 text-muted-foreground/40" />}
        thumbnailClassName="w-8 h-8 rounded-md bg-surface"
      />
    </div>
  );
}
