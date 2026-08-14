import type { HeatmapModel } from '../overviewUtils';
import type { ListeningAlbumStat, ListeningStatsSummary } from '@/types/electron';
import type { Track } from '@/stores/types';
import type { WeeklyRecap } from '@/hooks/queries/useRecap';
import type { OverviewSectionId } from '@/lib/overview-sections';

/** Localized copy for the error / first-run / empty surfaces. */
export interface IOverviewCopy {
  readonly errorTitle: string;
  readonly errorSubtitle: string;
  readonly retryLabel: string;
  readonly firstRunTitle: string;
  readonly firstRunSubtitle: string;
  readonly firstRunAction: string;
  readonly emptySectionTitle: string;
  readonly emptySectionCopy: string;
}

export interface IOverviewView {
  /** The summary stats payload for the stat strip + top-this-week. */
  readonly summary: ListeningStatsSummary;
  /** Heatmap model for the listening clock. */
  readonly heatmap: HeatmapModel;
  /** Top albums for the side card. */
  readonly topAlbums: ListeningAlbumStat[];
  /** Gap-based session count for the last 7 days. */
  readonly sessionCount: number;
  /** Week-over-week minute delta, or undefined when there's no comparison. */
  readonly trendDeltaMinutes: number | undefined;
  /** Recently-added tracks for the rail. */
  readonly recentlyAdded: Track[];
  /** Count of tracks added in the last week. */
  readonly newInLibraryCount: number;
  /** Whether the library has any tracks. */
  readonly hasLibrary: boolean;
  /** Whether there's any listening history yet. */
  readonly hasHistory: boolean;
  /** Whether the library has finished loading. */
  readonly libraryLoaded: boolean;
  /** Whether the overview data query is loading. */
  readonly isLoading: boolean;
  /** Whether the overview data query errored. */
  readonly isError: boolean;

  /** Last completed week's recap, when it earned a card. */
  readonly recap: WeeklyRecap | null;
  /** Whether the recap card is in its reveal window (and enabled). */
  readonly showRecap: boolean;

  // Section order + visibility (interface-store driven).
  /** User-chosen Overview section order, already reconciled by the store. */
  readonly sectionOrder: readonly OverviewSectionId[];
  readonly showStats: boolean;
  readonly showTopWeek: boolean;
  readonly showClock: boolean;
  readonly showTopAlbums: boolean;
  readonly showMixes: boolean;
  readonly showRecommendations: boolean;
  /** Whether either right-column widget (clock/top albums) is visible. */
  readonly showRightColumn: boolean;
  /** Whether the week-grid row (top-week + right column) should render. */
  readonly showWeekGrid: boolean;
  /** Whether the recently-added rail should render (enabled AND non-empty). */
  readonly showRecents: boolean;

  /** Localized copy bundle. */
  readonly copy: IOverviewCopy;
  /** Play a library track by id. */
  readonly handlePlayTrack: (trackId: string) => void;
  /** Retry the overview data query (error state). */
  readonly onRetry: () => void;
  /** Open a music folder (first-run action). */
  readonly onOpenFolder: () => void;
  /** Navigate to the library view (top-week action). */
  readonly onNavigateLibrary: () => void;
  /** Navigate to History (the recap card's "Past weeks" action). */
  readonly onNavigateHistory: () => void;
}
