import type { DiscoverRecommendation, LibraryRecommendation } from '@shiranami/contracts';
import type { DependencyInstallStatus } from '@/components/search/DependencyInstallCard';

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

export interface IRecommendationsShelfProps {
  /** Plays an existing library track by id (Overview's handler). */
  readonly onPlay: (trackId: string) => void;
  /**
   * Whether the user already has a library. Controls the both-empty behaviour:
   * when true and both shelves are empty, show the shell + quiet inner empty
   * state (not null). When false (first run), the shelf hides entirely so the
   * Overview's first-run state owns the surface.
   */
  readonly hasLibrary: boolean;
}

/** Props the dependency-install card needs, bundled from the deps hook. */
export interface IDependencyInstallProps {
  readonly ffmpegInstalled: boolean | undefined;
  readonly installStatus: DependencyInstallStatus;
  readonly installError: string | null;
  readonly isInstallInProgress: boolean;
  readonly installProgress: number;
  readonly installLabel: string;
  readonly onInstall: () => void;
}

export interface IRecommendationsShelfView {
  /** True first run / still loading — the shelf renders nothing. */
  readonly shouldHide: boolean;
  /** Stable heading id for `aria-labelledby`. */
  readonly headingId: string;
  /** Whether a background refresh is in flight. */
  readonly isRefreshing: boolean;
  /** Whether the data is stale (drives the "updated N ago" hint + refresh tint). */
  readonly isStale: boolean;
  /** "updated N ago" relative label, when stale and a timestamp exists. */
  readonly updatedAgo: string | null;
  /** Whether either shelf has any items. */
  readonly hasAny: boolean;
  /** Whether the discover tools (yt-dlp/ffmpeg) need installing. */
  readonly needsInstall: boolean;
  /** Whether the quiet both-empty inner state should render. */
  readonly showEmptyState: boolean;
  /** Whether the discover section should render at all. */
  readonly showDiscoverSection: boolean;
  /** Library rows to render (already sliced). */
  readonly librarySlice: readonly LibraryRecommendation[];
  /** Count of library items beyond the visible slice. */
  readonly libraryExtra: number;
  /** Discover rows to render (already sliced). */
  readonly discoverSlice: readonly DiscoverRecommendation[];
  /** Count of discover items beyond the visible slice. */
  readonly discoverExtra: number;
  /** Per-item download status map. */
  readonly statuses: Record<string, DownloadStatus>;
  /** Currently-loading preview id, if any. */
  readonly previewLoadingId: string | null;
  /** Dependency-install card props. */
  readonly dependencyInstall: IDependencyInstallProps;
  /** Trigger a manual refresh. */
  readonly onRefresh: () => void;
  /** Enqueue a discovered track download. */
  readonly onDownload: (item: DiscoverRecommendation) => void;
  /** Toggle an audio preview for a discovered track. */
  readonly onPreview: (item: DiscoverRecommendation) => void;
  /** Whether a given discover item is currently previewing. */
  readonly isPreviewing: (youtubeId: string) => boolean;
}
