import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IBulkActionBarProps {
  /** The full list the bar acts within — drives select-all and the playlist fallback resolution. */
  readonly trackList: Track[];
  /** Optional playlist-scoped removal; when present a "Remove from playlist" action appears. */
  readonly onRemoveFromPlaylist?: (trackIds: string[]) => void;
}

export interface IBulkActionBarView {
  /** Bound `contextMenu` namespace translator (action labels). */
  readonly t: TranslateFn;
  /** Bound `common` namespace translator (chrome labels). */
  readonly tCommon: TranslateFn;
  /** True when there is an active selection — the bar renders only then. */
  readonly isVisible: boolean;
  /** Size of the current selection. */
  readonly count: number;
  /** True when every track in `trackList` is selected (toggles select-all ⇄ clear). */
  readonly allSelected: boolean;
  /** Whether the playlist-removal action is available (drives the optional action). */
  readonly hasRemoveFromPlaylist: boolean;
  /** Play the selected track(s) next. */
  readonly onPlayNext: () => void;
  /** Append the selected track(s) to the queue. */
  readonly onAddToQueue: () => void;
  /** Toggle favorite for the selected track(s). */
  readonly onToggleFavorite: () => void;
  /** Toggle between select-all and clear depending on `allSelected`. */
  readonly onToggleSelectAll: () => void;
  /** Remove the selection from the current playlist (no-op when unavailable). */
  readonly onRemoveFromPlaylist: () => void;
  /** Remove the selection from the library. */
  readonly onRemoveFromLibrary: () => void;
  /** Remove the selection from the library and delete the files. */
  readonly onDeleteFromDisk: () => void;
  /** Clear the current selection (dismiss the bar). */
  readonly onClearSelection: () => void;
}
