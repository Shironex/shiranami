import { type Track } from '@/stores/usePlayerStore';
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
