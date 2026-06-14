import type { ListeningStatsTrack } from '@/types/electron';

export interface IHistoryTopTrackRowProps {
  readonly track: ListeningStatsTrack;
  readonly onPlay: (trackId: string) => void;
}

export interface IHistoryTopTrackRowView {
  readonly track: ListeningStatsTrack;
  /** Localized "N plays" label. */
  readonly playsLabel: string;
  /** Localized listened-time label (hours/minutes/seconds). */
  readonly listenTime: string;
  /** Play the track this row represents. */
  readonly onPlay: () => void;
}
