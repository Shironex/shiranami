import type { Track } from '@/stores/types';

export interface ITrackRowProps {
  readonly queue: Track[];
  readonly currentTrack: Track | null;
  readonly isPlaying: boolean;
  readonly handlePlayTrack: (index: number) => void;
  readonly onToggleFavorite?: (trackId: string) => void;
  readonly onRemoveFromPlaylist?: (trackId: string) => void;
  readonly showAddToPlaylist?: boolean;
}

export interface ITrackRowView {
  /** The resolved track at the row's index, or null when out of bounds. */
  readonly track: Track | null;
}
