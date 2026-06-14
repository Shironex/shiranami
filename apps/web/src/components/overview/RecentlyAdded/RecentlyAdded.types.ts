import type { Track } from '@/stores/types';

export interface IRecentlyAddedProps {
  readonly tracks: Track[];
  readonly onPlay: (trackId: string) => void;
}

/** One render-ready "recently added" card. */
export interface IRecentlyAddedRow {
  readonly id: string;
  readonly title: string;
  /** "Artist · 2 days ago"-style subtitle. */
  readonly subtitle: string;
  readonly albumArt: string | undefined;
  /** Seed for the cover's deterministic gradient/glyph. */
  readonly coverSeed: string;
  /** Localized play aria-label. */
  readonly playAria: string;
}

export interface IRecentlyAddedView {
  /** Card heading. */
  readonly title: string;
  /** "{n} new tracks" count label. */
  readonly countLabel: string;
  /** Fully computed rows. */
  readonly rows: readonly IRecentlyAddedRow[];
}
