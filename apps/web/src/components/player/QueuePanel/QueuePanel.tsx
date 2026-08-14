import { Trash2, Music, ListPlus, Loader2 } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { SortableQueueRow, DragOverlayContent, QueueItem } from '../QueueRow';
import { useQueuePanel } from './QueuePanel.hooks';
import type { IQueuePanelProps } from './QueuePanel.types';

export default function QueuePanel(props: IQueuePanelProps) {
  const {
    t,
    tCommon,
    headerAction,
    hasQueue,
    nowPlayingTrack,
    isPlaying,
    queueIndex,
    upNextRows,
    sortableIds,
    activeTrack,
    sensors,
    showClearConfirm,
    onClearConfirmOpenChange,
    onConfirmClear,
    onCancelClear,
    showSaveForm,
    onSaveFormOpenChange,
    saveName,
    onSaveNameChange,
    onSaveNameKeyDown,
    isSavingPlaylist,
    canSavePlaylist,
    onSaveAsPlaylist,
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
      <div className="px-5 py-2 min-h-[49px] border-b border-border/20 shrink-0 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
          {t('title')}
        </h2>
        <div className="flex items-center gap-1">
          {hasQueue && (
            <Popover open={showSaveForm} onOpenChange={onSaveFormOpenChange}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <IconButton aria-label={t('saveAsPlaylist')}>
                      <ListPlus />
                    </IconButton>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('saveAsPlaylist')}</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="w-64">
                <p className="text-xs font-medium text-foreground/80 mb-2">{t('saveAsPlaylist')}</p>
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={saveName}
                    onChange={e => onSaveNameChange(e.target.value)}
                    onKeyDown={onSaveNameKeyDown}
                    placeholder={tCommon('namePlaceholder')}
                    aria-label={tCommon('namePlaceholder')}
                    disabled={isSavingPlaylist}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-background/50 border border-border/30 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button
                    size="sm"
                    onClick={() => void onSaveAsPlaylist()}
                    disabled={!canSavePlaylist}
                    className="h-7 bg-primary/20 px-2.5 text-primary shadow-none hover:bg-primary/30 [&_svg]:size-3.5"
                  >
                    {isSavingPlaylist && <Loader2 className="animate-spin" />}
                    {tCommon('save')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {hasQueue && (
            <Popover open={showClearConfirm} onOpenChange={onClearConfirmOpenChange}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <IconButton
                      aria-label={t('clear')}
                      className="hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 />
                    </IconButton>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('clear')}</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="w-64">
                <p className="text-xs text-foreground/80 mb-2">{t('clearConfirm')}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onConfirmClear}
                    className="focus-ring flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                  >
                    {t('clearConfirmAction')}
                  </button>
                  <button
                    onClick={onCancelClear}
                    className="focus-ring flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    {t('keep')}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {headerAction}
        </div>
      </div>

      {/* Content */}
      {!hasQueue ? (
        <ViewEmptyState
          compact
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          icon={Music}
        />
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Now Playing */}
          {nowPlayingTrack && (
            <div className="shrink-0 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium px-2 mb-1.5">
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
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium px-2 mb-1.5">
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
