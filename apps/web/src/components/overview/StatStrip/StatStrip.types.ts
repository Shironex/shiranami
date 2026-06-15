import type { ListeningStatsSummary } from '@/types/electron';
import type { StatTrendDirection } from '../StatTile';

export interface IStatStripProps {
  readonly summary: ListeningStatsSummary;
  readonly newInLibraryCount: number;
  /** Week-over-week minute delta. `undefined` → no comparison line. */
  readonly trendDeltaMinutes?: number;
  /** Gap-based session count for the last 7 days. */
  readonly sessionCount?: number;
}

/** Static label set for one stat tile (label is localized in the hook). */
export interface IStatTileLabels {
  readonly listenedThisWeek: string;
  readonly tracksPlayed: string;
  readonly topArtist: string;
  readonly newInLibrary: string;
}

export interface IStatStripView {
  /** Total minutes listened this week (the first tile renders this via parts). */
  readonly totalMinutes: number;
  /** Localized tile labels. */
  readonly labels: IStatTileLabels;
  /** Listened-tile trend hint copy. */
  readonly trendHint: string;
  /** Listened-tile trend direction (tints the hint). */
  readonly trendDir: StatTrendDirection;
  /** Total plays this week, locale-formatted. */
  readonly tracksPlayed: string;
  /** Tracks-tile "across N sessions" hint, when there are sessions. */
  readonly tracksHint: string | undefined;
  /** Top artist name, or a localized fallback. */
  readonly topArtistValue: string;
  /** Top-artist play-count hint, when there is a top artist. */
  readonly topArtistHint: string | undefined;
  /** New-in-library value ("+3" / "0"). */
  readonly newInLibraryValue: string;
  /** New-in-library hint, when something was added. */
  readonly newInLibraryHint: string | undefined;
}
