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

/**
 * Row adapter for `react-window`'s `List`. Renders a positioned wrapper and
 * delegates all content to `TrackRowContent` (which is memoised and handles
 * its own re-render gating via narrowed store subscriptions).
 *
 * `memo` is intentionally absent here: `react-window` constructs a fresh
 * `style` object literal and fresh `ariaAttributes` on every list render, so a
 * default shallow comparison always fails — the wrapper adds cost with no
 * benefit. `memo(TrackRowContent)` one level down is what prevents the content
 * subtree from re-rendering when only the wrapper's positional props change.
 */
export function TrackRow(props: RowComponentProps<TrackRowProps>) {
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
