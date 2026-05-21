import { useTranslation } from 'react-i18next';
import { ListMusic } from 'lucide-react';
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
import { SortableTrackRow } from '@/components/shared/SortableTrackRow';
import { DragOverlayContent } from './DragOverlayContent';

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
    <div className="flex-1 min-h-0 overflow-y-auto px-4 scrollbar-thin">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {displayTracks.map((track, index) => (
            <SortableTrackRow
              key={track.id}
              track={track}
              index={index}
              queue={displayTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              handlePlayTrack={onPlayTrack}
              onToggleFavorite={onToggleFavorite}
              onRemoveFromPlaylist={onRemoveTrack}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeTrack ? <DragOverlayContent track={activeTrack} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
