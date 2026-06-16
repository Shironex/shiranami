import type { AlbumSortMode } from '@/stores/useUIStore';
import type {
  IAlbumSortControlLabels,
  IAlbumSortControlProps,
  IAlbumSortControlView,
  IAlbumSortOption,
} from './AlbumSortControl.types';

const SORT_MODES: readonly AlbumSortMode[] = ['name', 'artist', 'year', 'recentlyAdded'];

function modeLabel(mode: AlbumSortMode, labels: IAlbumSortControlLabels): string {
  switch (mode) {
    case 'artist':
      return labels.modeArtist;
    case 'year':
      return labels.modeYear;
    case 'recentlyAdded':
      return labels.modeRecentlyAdded;
    case 'name':
    default:
      return labels.modeName;
  }
}

export function useAlbumSortControl({
  mode,
  labels,
}: IAlbumSortControlProps): IAlbumSortControlView {
  const modeOptions: IAlbumSortOption[] = SORT_MODES.map(m => ({
    mode: m,
    label: modeLabel(m, labels),
    active: mode === m,
  }));

  return {
    currentModeLabel: modeLabel(mode, labels),
    modeOptions,
  };
}
