import { Trash2, Music } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableQueueRow, DragOverlayContent, QueueItem } from '../QueueRow';
import { useQueuePanel } from './QueuePanel.hooks';
import type { IQueuePanelProps } from './QueuePanel.types';

export default function QueuePanel(props: IQueuePanelProps) {
  const {
    t,
    headerAction,
    hasQueue,
    nowPlayingTrack,
    isPlaying,
    queueIndex,
    upNextRows,
    sortableIds,
    activeTrack,
    sensors,
    onClear,
    onPlayIndex,
    onRemove,
    onDragStart,
    onDragEnd,
    onDragCancel,
  } = useQueuePanel(props);

  // Build the reorderable rows above the return so `.map` stays out of JSX
  // render position (the declarative-JSX rule).
  const upNextElements = upNextRows.map(row => (
    <SortableQueueRow
      key={row.sortableId}
      track={row.track}
      sortableId={row.sortableId}
      queueIndex={row.queueIndex}
      onPlay={onPlayIndex}
      onRemove={onRemove}
    />
  ));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border/20 shrink-0 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          {t('title')}
        </h2>
        <div className="flex items-center gap-3">
          {hasQueue && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              {t('clear')}
            </button>
          )}
          {headerAction}
        </div>
      </div>

      {/* Content */}
      {!hasQueue ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Music className="w-7 h-7 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/30 font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Now Playing */}
          {nowPlayingTrack && (
            <div className="shrink-0 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium px-2 mb-1.5">
                {t('nowPlaying')}
              </p>
              <QueueItem
                track={nowPlayingTrack}
                index={queueIndex}
                isActive={true}
                isPlaying={isPlaying}
                onPlay={onPlayIndex}
                onRemove={onRemove}
              />
            </div>
          )}

          {/* Up Next - Drag-and-drop reorderable */}
          {upNextRows.length > 0 && (
            <>
              <div className="shrink-0 px-3 pt-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium px-2 mb-1.5">
                  {t('upNext', { count: upNextRows.length })}
                </p>
              </div>
              <div className="flex-1 min-h-0 px-3 overflow-y-auto scrollbar-thin">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragCancel={onDragCancel}
                >
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {upNextElements}
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
