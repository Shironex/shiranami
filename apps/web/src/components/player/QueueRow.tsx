import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { X, Play, Pause, GripVertical } from 'lucide-react';
import { EqBars } from '@/components/shared/EqBars';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { motion } from 'motion/react';
import type { Track } from '@/stores/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface QueueRowTrack {
  title: string;
  artist: string;
  albumArt?: string;
  duration: number;
}

/* ── Shared queue-row body (thumbnail + title/artist + duration) ── */

interface QueueRowBodyProps {
  track: QueueRowTrack;
  thumbnailFallback: ReactNode;
  thumbnailClassName: string;
  titleClassName?: string;
}

function QueueRowBody({
  track,
  thumbnailFallback,
  thumbnailClassName,
  titleClassName,
}: QueueRowBodyProps) {
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
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>
    </>
  );
}

/* ── Remove button shared by interactive rows ─────────────── */

function RemoveButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const { t } = useTranslation('queue');
  return (
    <motion.button
      whileTap={{ scale: 0.75 }}
      onClick={onClick}
      className="shrink-0 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all duration-150"
      aria-label={t('remove')}
    >
      <X className="w-3 h-3" />
    </motion.button>
  );
}

/* ── Sortable queue row (for Up Next items) ─────────────── */

export interface SortableQueueRowProps {
  track: Track;
  sortableId: string;
  queueIndex: number;
  onPlay: (queueIndex: number) => void;
  onRemove: (e: React.MouseEvent, queueIndex: number) => void;
}

export function SortableQueueRow({
  track,
  sortableId,
  queueIndex,
  onPlay,
  onRemove,
}: SortableQueueRowProps) {
  const { t } = useTranslation('queue');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-200 group cursor-pointer hover:bg-accent',
        isDragging && 'opacity-30'
      )}
      onClick={() => onPlay(queueIndex)}
    >
      <button
        className="shrink-0 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60 transition-all duration-150 cursor-grab active:cursor-grabbing touch-none"
        aria-label={t('dragToReorder')}
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

      <RemoveButton onClick={(e: React.MouseEvent) => onRemove(e, queueIndex)} />
    </div>
  );
}

/* ── Now Playing item (not draggable) ──────────────────── */

export interface QueueItemProps {
  track: { id: string; title: string; artist: string; albumArt?: string; duration: number };
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: (index: number) => void;
  onRemove: (e: React.MouseEvent, index: number) => void;
}

export const QueueItem = memo(function QueueItem({
  track,
  index,
  isActive,
  isPlaying,
  onPlay,
  onRemove,
}: QueueItemProps) {
  const { t } = useTranslation('queue');
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
        thumbnailFallback={
          isActive && isPlaying ? (
            <>
              <span className="sr-only">{t('nowPlaying')}</span>
              <EqBars size="sm" />
            </>
          ) : isActive ? (
            <Pause className="w-3 h-3 text-primary" />
          ) : (
            <Play className="w-3 h-3 text-muted-foreground/40" />
          )
        }
        thumbnailClassName={cn('w-8 h-8 rounded-md', isActive ? 'bg-primary/15' : 'bg-surface')}
        titleClassName={cn(isActive && 'text-primary')}
      />
      <RemoveButton onClick={(e: React.MouseEvent) => onRemove(e, index)} />
    </div>
  );
});

/* ── Drag overlay content ──────────────────────────────── */

export function DragOverlayContent({ track }: { track: QueueRowTrack }) {
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

export { QueueRowBody, RemoveButton };
export type { QueueRowTrack };
