import type { AlbumSortMode } from '@/stores/useUIStore';

export interface IAlbumSortControlLabels {
  readonly button: string;
  readonly modeName: string;
  readonly modeArtist: string;
  readonly modeYear: string;
  readonly modeRecentlyAdded: string;
  readonly orderAsc: string;
  readonly orderDesc: string;
}

export interface IAlbumSortControlProps {
  readonly mode: AlbumSortMode;
  readonly order: 'asc' | 'desc';
  readonly onModeChange: (mode: AlbumSortMode) => void;
  readonly onOrderChange: (order: 'asc' | 'desc') => void;
  readonly labels: IAlbumSortControlLabels;
}

export interface IAlbumSortOption {
  readonly mode: AlbumSortMode;
  readonly label: string;
  readonly active: boolean;
}

export interface IAlbumSortControlView {
  /** Localized label for the currently-selected sort mode (the trigger summary). */
  readonly currentModeLabel: string;
  /** The four sort-mode options, each with its localized label + active flag. */
  readonly modeOptions: readonly IAlbumSortOption[];
}
