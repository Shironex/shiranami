import type { ListeningStatsTrack } from '@/types/electron';

export interface ITopThisWeekProps {
  readonly tracks: ListeningStatsTrack[];
  readonly onPlay: (trackId: string) => void;
  readonly onOpenLibrary: () => void;
}

/** One render-ready "top this week" row. */
export interface ITopThisWeekRow {
  readonly trackId: string;
  /** Two-digit rank label ("01"). */
  readonly rankLabel: string;
  readonly title: string;
  /** "Artist · Album" subtitle (artist falls back to the unknown label). */
  readonly subtitle: string;
  readonly albumArt: string | null;
  /** Seed for the cover's deterministic gradient/glyph. */
  readonly coverSeed: string;
  /** Bar fill width as a percentage (0–100). */
  readonly width: number;
  readonly playCount: number;
  /** Localized play aria-label. */
  readonly playAria: string;
}

export interface ITopThisWeekView {
  /** Card heading. */
  readonly title: string;
  /** "Open library →" action label. */
  readonly openLibraryLabel: string;
  /** Whether there are any tracks to show. */
  readonly hasTracks: boolean;
  /** Empty-state copy (only meaningful when `!hasTracks`). */
  readonly emptyCopy: string;
  /** Fully computed rows. */
  readonly rows: readonly ITopThisWeekRow[];
}
