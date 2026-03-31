import { memo, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { X, Trash2, Music, Play, Pause, GripVertical } from 'lucide-react';
import { EqBars } from '@/components/shared/EqBars';
import { motion } from 'motion/react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ── Sortable queue row (for Up Next items) ─────────────── */

interface SortableQueueRowProps {
  track: Track;
  sortableId: string;
  queueIndex: number;
  onPlay: (queueIndex: number) => void;
  onRemove: (e: React.MouseEvent, queueIndex: number) => void;
}

function SortableQueueRow({ track, sortableId, queueIndex, onPlay, onRemove }: SortableQueueRowProps) {
  const { t } = useTranslation('queue');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

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
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3" />
      </button>

      <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden bg-surface">
        {track.albumArt ? (
          <img src={track.albumArt} alt={track.title} className="w-full h-full object-cover rounded-md" />
        ) : (
          <Play className="w-3 h-3 text-muted-foreground/40" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{track.title}</p>
        <p className="text-[10px] text-muted-foreground/50 truncate">{track.artist}</p>
      </div>

      <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>

      <motion.button
        whileTap={{ scale: 0.75 }}
        onClick={(e) => onRemove(e, queueIndex)}
        className="shrink-0 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all duration-150"
        aria-label={t('remove')}
      >
        <X className="w-3 h-3" />
      </motion.button>
    </div>
  );
}

/* ── Drag overlay content ──────────────────────────────── */

function DragOverlayContent({ track }: { track: Track }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-accent text-foreground shadow-lg">
      <div className="shrink-0 p-0.5 text-muted-foreground/40">
        <GripVertical className="w-3 h-3" />
      </div>
      <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden bg-surface">
        {track.albumArt ? (
          <img src={track.albumArt} alt={track.title} className="w-full h-full object-cover rounded-md" />
        ) : (
          <Play className="w-3 h-3 text-muted-foreground/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{track.title}</p>
        <p className="text-[10px] text-muted-foreground/50 truncate">{track.artist}</p>
      </div>
      <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>
    </div>
  );
}

/* ── Main QueuePanel ───────────────────────────────────── */

export function QueuePanel() {
  const { t } = useTranslation('queue');
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);
  const reorderQueue = usePlayerStore(s => s.reorderQueue);
  const clearQueue = usePlayerStore(s => s.clearQueue);
  const togglePlay = usePlayerStore(s => s.togglePlay);

  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;

  const handlePlayIndex = useCallback(
    (index: number) => {
      if (index === queueIndexRef.current) {
        togglePlay();
      } else {
        setQueue(queueRef.current, index);
      }
    },
    [setQueue, togglePlay]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      removeFromQueue(index);
    },
    [removeFromQueue]
  );

  const upNext = queue.slice(queueIndex + 1);
  const upNextOffset = queueIndex + 1;

  // Sortable IDs use absolute queue index to handle duplicate tracks
  const sortableIds = useMemo(
    () => upNext.map((_, i) => `queue-${i + upNextOffset}`),
    [upNext, upNextOffset]
  );

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeTrack = useMemo(() => {
    if (!activeId) return null;
    const absIdx = parseInt(activeId.replace('queue-', ''), 10);
    return queue[absIdx] ?? null;
  }, [activeId, queue]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const fromAbs = parseInt((active.id as string).replace('queue-', ''), 10);
      const toAbs = parseInt((over.id as string).replace('queue-', ''), 10);
      reorderQueue(fromAbs, toAbs);
    },
    [reorderQueue]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border/20 shrink-0 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          {t('title')}
        </h2>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/40 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {t('clear')}
          </button>
        )}
      </div>

      {/* Content */}
      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Music className="w-7 h-7 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/30 font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Now Playing */}
          {currentTrack && queueIndex >= 0 && (
            <div className="shrink-0 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium px-2 mb-1.5">
                {t('nowPlaying')}
              </p>
              <QueueItem
                track={currentTrack}
                index={queueIndex}
                isActive={true}
                isPlaying={isPlaying}
                onPlay={handlePlayIndex}
                onRemove={handleRemove}
              />
            </div>
          )}

          {/* Up Next - Drag-and-drop reorderable */}
          {upNext.length > 0 && (
            <>
              <div className="shrink-0 px-3 pt-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium px-2 mb-1.5">
                  {t('upNext', { count: upNext.length })}
                </p>
              </div>
              <div className="flex-1 min-h-0 px-3 overflow-y-auto scrollbar-thin">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={handleDragCancel}
                >
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {upNext.map((track, i) => (
                      <SortableQueueRow
                        key={sortableIds[i]}
                        track={track}
                        sortableId={sortableIds[i]}
                        queueIndex={i + upNextOffset}
                        onPlay={handlePlayIndex}
                        onRemove={handleRemove}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {activeTrack ? <DragOverlayContent track={activeTrack} /> : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Now Playing item (not draggable) ──────────────────── */

interface QueueItemProps {
  track: { id: string; title: string; artist: string; albumArt?: string; duration: number };
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: (index: number) => void;
  onRemove: (e: React.MouseEvent, index: number) => void;
}

const QueueItem = memo(function QueueItem({ track, index, isActive, isPlaying, onPlay, onRemove }: QueueItemProps) {
  const { t } = useTranslation('queue');
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 group cursor-pointer',
        isActive
          ? 'bg-primary/[0.08]'
          : 'hover:bg-accent'
      )}
      onClick={() => onPlay(index)}
    >
      <div className={cn(
        'w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden',
        isActive ? 'bg-primary/15' : 'bg-surface'
      )}>
        {track.albumArt ? (
          <img src={track.albumArt} alt={track.title} className="w-full h-full object-cover rounded-md" />
        ) : isActive && isPlaying ? (
          <>
            <span className="sr-only">{t('nowPlaying')}</span>
            <EqBars size="sm" />
          </>
        ) : isActive ? (
          <Pause className="w-3 h-3 text-primary" />
        ) : (
          <Play className="w-3 h-3 text-muted-foreground/40" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-medium truncate', isActive && 'text-primary')}>
          {track.title}
        </p>
        <p className="text-[10px] text-muted-foreground/50 truncate">{track.artist}</p>
      </div>

      <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>

      <motion.button
        whileTap={{ scale: 0.75 }}
        onClick={(e) => onRemove(e, index)}
        className="shrink-0 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all duration-150"
        aria-label={t('remove')}
      >
        <X className="w-3 h-3" />
      </motion.button>
    </div>
  );
});

export default QueuePanel;
