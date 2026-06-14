import type { LucideIcon } from 'lucide-react';
import type {
  ListeningActivityPoint,
  ListeningHistoryEntry,
  ListeningStatsArtist,
  ListeningStatsTrack,
} from '@/types/electron';
import type { HistoryRange } from '@/components/history/historyUtils';

/** A single summary stat card, fully resolved by the hook. */
export interface IHistoryStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly icon: LucideIcon;
}

export interface IHistoryViewView {
  /** Render the error empty state instead of the dashboard. */
  readonly isError: boolean;
  /** Render the loading skeleton instead of the dashboard. */
  readonly isLoading: boolean;
  /** Error empty-state title. */
  readonly errorTitle: string;
  /** Error empty-state subtitle. */
  readonly errorSubtitle: string;
  /** Retry button label. */
  readonly retryLabel: string;
  /** Retry the history query. */
  readonly onRetry: () => void;

  /** Currently selected range, drives the hero pills + copy. */
  readonly selectedRange: HistoryRange;
  /** Change the selected range. */
  readonly onRangeChange: (range: HistoryRange) => void;

  /** Summary stat cards in display order. */
  readonly stats: readonly IHistoryStat[];

  /** Section heading for the activity panel. */
  readonly activityTitle: string;
  /** Activity panel sub-copy, parameterized by the active range. */
  readonly activityCaption: string;
  /** Activity series for the graph. */
  readonly activitySeries: ListeningActivityPoint[];

  /** "Top Tracks" panel heading. */
  readonly topTracksTitle: string;
  /** Most-played tracks for the range. */
  readonly topTracks: readonly ListeningStatsTrack[];
  /** Empty-state title shown when there are no top tracks. */
  readonly noTopTracksTitle: string;
  /** Empty-state copy shown when there are no top tracks. */
  readonly noTopTracksCopy: string;

  /** "Top Artists" panel heading. */
  readonly topArtistsTitle: string;
  /** Most-played artists for the range. */
  readonly topArtists: readonly ListeningStatsArtist[];
  /** Empty-state title shown when there are no artist trends. */
  readonly noArtistTrendsTitle: string;
  /** Empty-state copy shown when there are no artist trends. */
  readonly noArtistTrendsCopy: string;

  /** "Recent Plays" panel heading. */
  readonly recentTitle: string;
  /** Recent history entries for the range. */
  readonly recent: readonly ListeningHistoryEntry[];
  /** Empty-state title shown when there are no recent plays. */
  readonly noRecentPlaysTitle: string;
  /** Empty-state copy shown when there are no recent plays. */
  readonly noRecentPlaysCopy: string;

  /** Play a track by id (from any of the row lists). */
  readonly onPlayTrack: (trackId: string) => void;
}
