import type { ListeningHistoryEntry } from '@/types/electron';

export interface IHistoryRecentRowProps {
  readonly entry: ListeningHistoryEntry;
  readonly onPlay: (trackId: string) => void;
}

export interface IHistoryRecentRowView {
  readonly entry: ListeningHistoryEntry;
  /** "Artist / Album" subtitle line. */
  readonly subtitle: string;
  /** Formatted played duration. */
  readonly playedDuration: string;
  /** Formatted played-at timestamp. */
  readonly playedAt: string;
  /** Play the track this row represents. */
  readonly onPlay: () => void;
}
