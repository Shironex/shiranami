import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';
import type { TrackRowProps } from '@/components/shared/TrackRow';
import type {
  AlbumGridSize,
  AlbumSortMode,
  AlbumSortOrder,
  LibraryViewMode,
} from '@/stores/useUIStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** Labels handed to the album sort control. */
export interface IAlbumSortLabels {
  readonly button: string;
  readonly modeName: string;
  readonly modeArtist: string;
  readonly modeYear: string;
  readonly modeRecentlyAdded: string;
  readonly orderAsc: string;
  readonly orderDesc: string;
}

/** Labels handed to the grid-size toggle. */
export interface IGridSizeLabels {
  readonly group: string;
  readonly small: string;
  readonly medium: string;
  readonly large: string;
}

export interface ILibraryViewView {
  /** Bound `library` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Cold start: the initial library query is in flight with no cached tracks — show the skeleton. */
  readonly showSkeleton: boolean;
  /** An album is selected in albums mode — render the album detail view instead. */
  readonly showAlbumDetail: boolean;
  /** The full library, in library order. */
  readonly library: Track[];
  /** The library filtered by the active search query. */
  readonly filteredLibrary: Track[];
  /** Active view mode (tracks vs. albums). */
  readonly viewMode: LibraryViewMode;
  /** Whether the now-playing hero card is enabled in settings. */
  readonly heroCardEnabled: boolean;
  /** Whether any tracks are selected — toggles the bulk action bar. */
  readonly hasSelection: boolean;
  /** Ref attached to the search input for the Ctrl/Cmd+F focus shortcut. */
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  /** Current search query text. */
  readonly searchQuery: string;
  /** Placeholder + aria-label for the search input, mode-aware. */
  readonly searchPlaceholder: string;
  /** Whether a search filter is active. */
  readonly isFiltered: boolean;
  /** True only in albums mode — gates the sort + grid-size controls. */
  readonly isAlbumsMode: boolean;
  /** True only in tracks mode — gates the empty/list content. */
  readonly isTracksMode: boolean;
  /** The library has no tracks at all — show the onboarding empty state. */
  readonly isLibraryEmpty: boolean;
  /** A filter is active but matched nothing in tracks mode — show the no-matches state. */
  readonly hasNoMatches: boolean;
  /** Whether to render the per-track filter count line. */
  readonly showTrackFilterCount: boolean;
  /** Localized "{{filtered}} of {{total}} tracks" line. */
  readonly trackFilterCountLabel: string;
  /** Props passed to each virtualized `TrackRow` via react-window's `rowProps`. */
  readonly rowProps: TrackRowProps;
  /** Album grid size for the toggle control. */
  readonly albumGridSize: AlbumGridSize;
  /** Album sort mode for the sort control. */
  readonly albumSortMode: AlbumSortMode;
  /** Album sort order for the sort control. */
  readonly albumSortOrder: AlbumSortOrder;
  /** Localized labels for the album sort control. */
  readonly albumSortLabels: IAlbumSortLabels;
  /** Localized labels for the grid-size toggle. */
  readonly gridSizeLabels: IGridSizeLabels;
  /** Set the active library view mode. */
  readonly onViewModeChange: (mode: LibraryViewMode) => void;
  /** Update the search query. */
  readonly onSearchChange: (query: string) => void;
  /** Clear the active search query. */
  readonly onClearSearch: () => void;
  /** Set the album grid size. */
  readonly onAlbumGridSizeChange: (size: AlbumGridSize) => void;
  /** Set the album sort mode. */
  readonly onAlbumSortModeChange: (mode: AlbumSortMode) => void;
  /** Set the album sort order. */
  readonly onAlbumSortOrderChange: (order: AlbumSortOrder) => void;
  /** Keydown handler implementing the Ctrl/Cmd+F focus shortcut. */
  readonly onKeyDown: (e: React.KeyboardEvent) => void;
}
