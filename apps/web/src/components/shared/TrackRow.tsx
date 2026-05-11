import { memo } from 'react';
import { type Track } from '@/stores/types';
import { type RowComponentProps } from 'react-window';
import { TrackRowContent } from './TrackRowContent';

export interface TrackRowProps {
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  handlePlayTrack: (index: number) => void;
  onToggleFavorite?: (trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  showAddToPlaylist?: boolean;
}

function TrackRowImpl(props: RowComponentProps<TrackRowProps>) {
  const {
    index,
    style,
    queue,
    currentTrack,
    isPlaying,
    handlePlayTrack,
    onToggleFavorite,
    onRemoveFromPlaylist,
    showAddToPlaylist,
  } = props as RowComponentProps<TrackRowProps> & TrackRowProps;

  const track = queue[index];
  if (!track) return null;

  return (
    <div style={style} className="px-0.5">
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
      />
    </div>
  );
}

/**
 * Memoised so a list-level re-render of `react-window`'s `List` doesn't
 * re-render every mounted row. `LibraryView` builds `rowProps` from stable
 * refs (memoised `filteredLibrary`, `useCallback` handlers, the stable
 * Zustand action ref); `react-window` spreads those keys plus `index`/`style`
 * onto the row, so the only props that change per render are `index`, `style`,
 * and the now-playing flags (`currentTrack`/`isPlaying`) — a default shallow
 * comparison handles all of them correctly.
 *
 * Cast back to the plain function signature so it satisfies `react-window`'s
 * `rowComponent` prop type (which expects `(props) => ReactElement | null`,
 * not a `MemoExoticComponent`); `memo` is transparent at runtime.
 */
export const TrackRow = memo(TrackRowImpl) as unknown as typeof TrackRowImpl;
