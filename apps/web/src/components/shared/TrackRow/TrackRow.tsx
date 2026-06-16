import { type RowComponentProps } from 'react-window';
import { TrackRowContent } from '@/components/shared/TrackRowContent';
import { useTrackRow } from './TrackRow.hooks';
import type { ITrackRowProps } from './TrackRow.types';

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
export default function TrackRow(props: RowComponentProps<ITrackRowProps>) {
  const { track } = useTrackRow(props);

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
  } = props as RowComponentProps<ITrackRowProps> & ITrackRowProps;

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
