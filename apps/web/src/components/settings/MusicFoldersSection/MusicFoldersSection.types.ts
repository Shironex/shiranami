import type { useTranslation } from 'react-i18next';
import type { SubfolderGroup } from '@/lib/scanHelpers';
import type { ISubfolderEntry } from '@/components/settings/SubfolderPlaylistDialog';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/**
 * A watched library folder row. This is a public DOMAIN type re-exported from
 * `@/components/settings/MusicFoldersSection` and consumed across features
 * (onboarding's FoldersStep, `useLibraryRescan`, `useFolders`). Its name is part
 * of that public contract — keep it as `WatchedFolder` (declared as a type alias,
 * not an interface, so it reads as a domain shape and isn't an `I`-prefixed
 * component contract).
 */
export type WatchedFolder = {
  id: string;
  path: string;
  lastScannedAt?: string;
};

/** One watched-folder row in the list. */
export interface IMusicFolderRow {
  /** Stable folder id (row key + remove target). */
  readonly id: string;
  /** Absolute folder path shown in the row. */
  readonly path: string;
}

export interface IMusicFoldersSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the watched-folders query is still loading. */
  readonly foldersLoading: boolean;
  /** Watched-folder rows to render. */
  readonly folders: readonly IMusicFolderRow[];
  /** Whether a scan is currently in progress (disables the add button). */
  readonly isScanning: boolean;
  /** Whether the add-folder button is disabled (scanning or scan lock held). */
  readonly isAddDisabled: boolean;
  /** Whether the subfolder-playlist dialog is open. */
  readonly subfolderDialogOpen: boolean;
  /** Subfolders detected by the most recent scan (drives the dialog). */
  readonly detectedSubfolders: SubfolderGroup[];
  /** Names of playlists that already exist (passed to the dialog). */
  readonly existingPlaylistNames: Set<string>;
  /** Pick a folder to add to the library. */
  readonly onAddFolder: () => void;
  /** Remove a watched folder by id. */
  readonly onRemoveFolder: (id: string) => void;
  /** Open/close handler for the subfolder-playlist dialog. */
  readonly onDialogOpenChange: (open: boolean) => void;
  /** Confirm handler that creates playlists for the chosen subfolders. */
  readonly onSubfolderConfirm: (selectedSubfolders: ISubfolderEntry[]) => void;
}
