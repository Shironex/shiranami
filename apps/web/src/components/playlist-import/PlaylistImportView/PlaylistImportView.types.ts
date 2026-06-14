import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';
import type { IPlaylistRowProps } from '../PlaylistRow';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPlaylistImportViewView {
  /** Bound `import` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Ref for the URL input. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
  /** Current URL input value. */
  readonly url: string;
  /** Update the URL input value. */
  readonly setUrl: (value: string) => void;
  /** Resolved playlist tracks. */
  readonly tracks: PlaylistTrack[];
  /** Whether a playlist URL is currently being extracted. */
  readonly isExtracting: boolean;
  /** Spotify per-track resolution progress, when available. */
  readonly extractProgress: { current: number; total: number; trackName: string } | null;
  /** Rounded percent for the Spotify extraction progress bar. */
  readonly extractProgressPercent: number;
  /** Whether an import is in flight. */
  readonly isImporting: boolean;
  /** Extraction error message, if any. */
  readonly extractError: string | null;
  /** Source playlist title surfaced by the provider, if any. */
  readonly sourceTitle: string | null;
  /** Whether to recreate a real Shiranami playlist from the imported tracks. */
  readonly createPlaylist: boolean;
  /** Toggle the create-playlist option. */
  readonly setCreatePlaylist: (value: boolean) => void;
  /** Number of tracks already processed. */
  readonly processedCount: number;
  /** Total tracks to process. */
  readonly totalCount: number;
  /** Pending track count, used for the download-all label. */
  readonly pendingCount: number;
  /** Pending tracks within the current selection, used for the download-selected label. */
  readonly selectedPendingCount: number;
  /** Overall import progress percent. */
  readonly overallProgress: number;
  /** Whether the import has finished. */
  readonly isFinished: boolean;
  /** Whether the URL input + extract button are disabled (extracting/importing). */
  readonly inputDisabled: boolean;
  /** Whether the extract button renders (idle, no results yet). */
  readonly showExtractButton: boolean;
  /** Whether the extract button is disabled (empty URL). */
  readonly extractDisabled: boolean;
  /** Whether the YouTube fetching block renders. */
  readonly showFetchingProgress: boolean;
  /** Whether the loaded-tracks action bar renders. */
  readonly hasResults: boolean;
  /** Whether the primary download button renders (results, idle, not finished). */
  readonly showDownloadButton: boolean;
  /** Whether the cancel button renders (importing). */
  readonly showCancelButton: boolean;
  /** Whether the progress block renders (importing or finished). */
  readonly showProgressBlock: boolean;
  /** Whether there is an active selection (changes the download button label). */
  readonly hasSelection: boolean;
  /** Whether the create-playlist option renders. */
  readonly showCreatePlaylistOption: boolean;
  /** Whether the bulk action bar renders. */
  readonly showBulkActionBar: boolean;
  /** Props passed to each virtualized `PlaylistRow` via react-window's `rowProps`. */
  readonly rowProps: IPlaylistRowProps;
  /** Trigger an extraction of the pasted URL. */
  readonly handleExtract: () => void;
  /** Keydown handler for the URL input (Enter triggers extract). */
  readonly handleKeyDown: (event: React.KeyboardEvent) => void;
  /** Cancel an in-flight import. */
  readonly handleCancel: () => void;
  /** Reset the import to start over. */
  readonly handleReset: () => void;
  /** Remove a set of tracks from the list (bulk action bar). */
  readonly handleRemoveTracks: (ids: Set<string>) => void;
  /** Download a set of tracks (bulk action bar). */
  readonly handleStartImportSelected: (ids: Set<string>) => void;
  /** Primary download button click (selected-aware). */
  readonly onDownloadClick: () => void;
}
