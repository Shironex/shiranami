import { GripVertical } from 'lucide-react';
import type { RowComponentProps } from 'react-window';
import { TrackRowContent } from '@/components/shared/TrackRowContent';
import { useVirtualSortableTrackRow } from './VirtualSortableTrackRow.hooks';
import type { IVirtualSortableTrackRowProps } from './VirtualSortableTrackRow.types';

/**
 * react-window row renderer that is also a dnd-kit sortable. react-window
 * positions each visible row with an absolute `style`; the hook merges that with
 * the sortable transform so the two compose instead of fighting. The full id
 * list still lives in the parent `SortableContext`, so dnd-kit tracks ordering
 * across rows that aren't currently mounted.
 */
export default function VirtualSortableTrackRow(
  props: RowComponentProps<IVirtualSortableTrackRowProps>
) {
  const {
    track,
    tracks,
    index,
    currentTrack,
    isPlaying,
    style,
    sortableStyle,
    setNodeRef,
    attributes,
    listeners,
    dragLabel,
    onPlayTrack,
    onToggleFavorite,
    onRemoveTrack,
  } = useVirtualSortableTrackRow(props);

  // react-window can briefly render a row whose index is past the end of the
  // list during a mutation (e.g. a removed track) before it reconciles its
  // rowCount; `track` is undefined for that frame, so render an empty
  // placeholder rather than crash on the track's fields.
  if (!track) {
    return <div style={style} />;
  }

  const dragHandle = (
    <button
      {...listeners}
      className="shrink-0 p-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors touch-none opacity-0 group-hover:opacity-100"
      aria-label={dragLabel}
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
