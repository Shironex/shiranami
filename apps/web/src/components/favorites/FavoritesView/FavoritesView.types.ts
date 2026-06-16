import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';
import type { ITrackRowProps } from '@/components/shared/TrackRow';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IFavoritesViewView {
  /** Bound `favorites` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Cold start: library hasn't loaded yet, so show the skeleton instead of an empty flash. */
  readonly showSkeleton: boolean;
  /** Favorited tracks, in library order. Owned, freshly-allocated array. */
  readonly favorites: Track[];
  /** No favorites to show — renders the empty state. */
  readonly isEmpty: boolean;
  /** Whether the now-playing hero card is enabled in settings. */
  readonly libraryHeroCardEnabled: boolean;
  /** Whether any tracks are selected — toggles the bulk action bar. */
  readonly hasSelection: boolean;
  /** Props passed to each virtualized `TrackRow` via react-window's `rowProps`. */
  readonly rowProps: ITrackRowProps;
}
