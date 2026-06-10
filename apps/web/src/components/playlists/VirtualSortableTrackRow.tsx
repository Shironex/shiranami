import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { RowComponentProps } from 'react-window';
import type { Track } from '@/stores/types';
import { TrackRowContent } from '@/components/shared/TrackRowContent';

export interface VirtualSortableTrackRowProps {
  /** Tracks in display order — the full list, indexed by react-window's `index`. */
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (index: number) => void;
  onToggleFavorite: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
}

/**
 * react-window row renderer that is also a dnd-kit sortable. react-window
 * positions each visible row with an absolute `style`; this merges that with
 * the sortable transform so the two compose instead of fighting. The full id
 * list still lives in the parent `SortableContext`, so dnd-kit tracks ordering
 * across rows that aren't currently mounted.
 */
export function VirtualSortableTrackRow({
  index,
  style,
  tracks,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onToggleFavorite,
  onRemoveTrack,
}: RowComponentProps<VirtualSortableTrackRowProps>) {
  const { t } = useTranslation('contextMenu');
  const track = tracks[index];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  // react-window positions each row with its own `transform: translateY(...)`
  // inside `style`. The sortable transform must compose with — not clobber —
  // that positioning, so the outer element keeps react-window's `style`
  // untouched and the sortable ref + reorder transform ride on an inner div.
  const sortableStyle: CSSProperties = {
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
    <div style={style}>
      <div ref={setNodeRef} style={sortableStyle} {...attributes} className="px-0.5">
        <TrackRowContent
          track={track}
          index={index}
          queue={tracks}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          handlePlayTrack={onPlayTrack}
          onToggleFavorite={onToggleFavorite}
          onRemoveFromPlaylist={onRemoveTrack}
          showAddToPlaylist
          compact
          dragHandle={dragHandle}
        />
      </div>
    </div>
  );
}
