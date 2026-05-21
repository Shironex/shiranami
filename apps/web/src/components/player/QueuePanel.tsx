import { useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { Trash2, Music } from 'lucide-react';
import { SortableQueueRow, DragOverlayContent, QueueItem } from '@/components/player/QueueRow';
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
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

/* ── Main QueuePanel ───────────────────────────────────── */

export function QueuePanel() {
  const { t } = useTranslation('queue');
  const queue = usePlaybackStore(s => s.queue);
  const queueIndex = usePlaybackStore(s => s.queueIndex);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const removeFromQueue = usePlaybackStore(s => s.removeFromQueue);
  const reorderQueue = usePlaybackStore(s => s.reorderQueue);
  const clearQueue = usePlaybackStore(s => s.clearQueue);
  const togglePlay = usePlaybackStore(s => s.togglePlay);

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

export default QueuePanel;
