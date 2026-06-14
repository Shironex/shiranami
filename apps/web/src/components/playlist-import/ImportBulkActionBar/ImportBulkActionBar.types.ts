import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

export interface IImportBulkActionBarProps {
  readonly tracks: PlaylistTrack[];
  readonly isImporting: boolean;
  readonly onDownloadSelected: (ids: Set<string>) => void;
  readonly onRemoveSelected: (ids: Set<string>) => void;
}

export interface IImportBulkActionBarView {
  /** No tracks selected — the bar renders nothing. */
  readonly isHidden: boolean;
  /** Number of selected tracks. */
  readonly count: number;
  /** Whether every track is currently selected (toggles select-all/clear). */
  readonly allSelected: boolean;
  /** Selected tracks still pending — gates the download action. */
  readonly pendingSelectedCount: number;
  /** Whether the download action renders (pending selection + not importing). */
  readonly canDownload: boolean;
  /** Whether the remove action renders (not importing). */
  readonly canRemove: boolean;
  /** Localized accessible label for the toolbar. */
  readonly toolbarLabel: string;
  /** Localized "N selected" label. */
  readonly selectedLabel: string;
  /** Localized label for the select-all / clear toggle (depends on `allSelected`). */
  readonly selectToggleLabel: string;
  /** Localized download-selected label, count-aware. */
  readonly downloadLabel: string;
  /** Localized remove-selected label. */
  readonly removeLabel: string;
  /** Localized clear-selection label. */
  readonly clearLabel: string;
  /** Toggle between selecting all tracks and clearing the selection. */
  readonly onToggleSelectAll: () => void;
  /** Download every selected track, then clear the selection. */
  readonly onDownload: () => void;
  /** Remove every selected track, then clear the selection. */
  readonly onRemove: () => void;
  /** Clear the current selection. */
  readonly onClear: () => void;
}
