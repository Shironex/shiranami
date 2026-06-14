import type { ListeningAlbumStat } from '@/types/electron';

export interface ITopAlbumsProps {
  readonly albums: ListeningAlbumStat[];
}

/** One render-ready album row with its precomputed bar width + play label. */
export interface ITopAlbumRow {
  readonly key: string;
  readonly album: string;
  readonly artist: string;
  /** Bar fill width as a percentage (0–100). */
  readonly width: number;
  /** Localized "{n} plays" label. */
  readonly playsLabel: string;
}

export interface ITopAlbumsView {
  /** Card heading. */
  readonly title: string;
  /** Whether there are any albums to show. */
  readonly hasAlbums: boolean;
  /** Empty-state copy (only meaningful when `!hasAlbums`). */
  readonly emptyCopy: string;
  /** Fully computed album rows. */
  readonly rows: readonly ITopAlbumRow[];
}
