import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ListMusic } from 'lucide-react';
import { List } from 'react-window';
import type { Track } from '@/stores/types';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { VirtualSortableTrackRow } from './VirtualSortableTrackRow';
import { DragOverlayContent } from './DragOverlayContent';

/** Matches TrackRowContent's fixed h-[48px] compact row. */
const ROW_HEIGHT = 48;

interface PlaylistTrackListProps {
  displayTracks: Track[];
  sortableIds: string[];
  activeTrack: Track | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  sensors: SensorDescriptor<SensorOptions>[];
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  onPlayTrack: (index: number) => void;
  onToggleFavorite: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
}

export function PlaylistTrackList({
  displayTracks,
  sortableIds,
  activeTrack,
  currentTrack,
  isPlaying,
  sensors,
  onDragStart,
  onDragEnd,
  onDragCancel,
  onPlayTrack,
  onToggleFavorite,
  onRemoveTrack,
}: PlaylistTrackListProps) {
  const { t } = useTranslation('playlists');

  // Row props are passed once to react-window; it re-renders rows when any of
  // these change. The row reads its own track via `index` from `tracks`.
  const rowProps = useMemo(
    () => ({
      tracks: displayTracks,
      currentTrack,
      isPlaying,
      onPlayTrack,
      onToggleFavorite,
      onRemoveTrack,
    }),
    [displayTracks, currentTrack, isPlaying, onPlayTrack, onToggleFavorite, onRemoveTrack]
  );

  if (displayTracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <ListMusic className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
        <div>
          <p className="font-display text-base font-medium text-muted-foreground">
            {t('detailEmptyTitle')}
          </p>
          <p className="text-sm text-muted-foreground/50 mt-1">{t('detailEmptySubtitle')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
      <div className="h-full px-2 py-1.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          {/* The full id list stays in SortableContext so dnd-kit knows the
              complete ordering even though react-window only mounts the visible
              rows below. Auto-scroll mounts rows as the cursor nears an edge, so
              dragging across a scroll boundary registers the new drop targets. */}
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <List
              rowCount={displayTracks.length}
              rowHeight={ROW_HEIGHT}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={VirtualSortableTrackRow}
              rowProps={rowProps}
            />
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeTrack ? <DragOverlayContent track={activeTrack} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
