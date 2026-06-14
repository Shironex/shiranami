import type { ListeningStatsArtist } from '@/types/electron';

export interface IHistoryTopArtistRowProps {
  readonly artist: ListeningStatsArtist;
}

export interface IHistoryTopArtistRowView {
  /** Artist name, falling back to the localized "Unknown artist" when blank. */
  readonly artistName: string;
  /** Localized listened-time label. */
  readonly listenTime: string;
  /** Localized "N plays" label. */
  readonly playsLabel: string;
}
