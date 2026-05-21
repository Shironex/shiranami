import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Track } from '@/stores/types';
import { GripVertical } from 'lucide-react';
import { TrackRowContent } from './TrackRowContent';

export interface SortableTrackRowProps {
  track: Track;
  index: number;
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  handlePlayTrack: (index: number) => void;
  onToggleFavorite?: (trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  showAddToPlaylist?: boolean;
}

export function SortableTrackRow({
  track,
  index,
  queue,
  currentTrack,
  isPlaying,
  handlePlayTrack,
  onToggleFavorite,
  onRemoveFromPlaylist,
  showAddToPlaylist,
}: SortableTrackRowProps) {
  const { t } = useTranslation('contextMenu');

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : undefined,
  };

  const dragHandle = (
    <button
      {...listeners}
      className="shrink-0 p-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors touch-none opacity-0 group-hover:opacity-100"
      aria-label={t('dragToReorder')}
      tabIndex={-1}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="px-0.5">
      <TrackRowContent
        track={track}
        index={index}
        queue={queue}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        handlePlayTrack={handlePlayTrack}
        onToggleFavorite={onToggleFavorite}
        onRemoveFromPlaylist={onRemoveFromPlaylist}
        showAddToPlaylist={showAddToPlaylist}
        compact
        dragHandle={dragHandle}
      />
    </div>
  );
}
