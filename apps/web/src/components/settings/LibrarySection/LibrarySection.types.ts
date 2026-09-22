import type { useTranslation } from 'react-i18next';
import type { SubfolderGroup } from '@/lib/scanHelpers';
import type { ISubfolderEntry } from '@/components/settings/SubfolderPlaylistDialog';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ILibrarySectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Bound `common`-namespace translator (for the shared "cancel" label). */
  readonly tc: TranslateFn;
  /** Whether the app is running in Electron (gates disk/backup cards). */
  readonly isElectron: boolean;
  /** Whether to show the analysis card (desktop + analysis API + tracks). */
  readonly showAnalysis: boolean;
  /** Whether to show the Library Doctor card (desktop + doctor API + tracks). */
  readonly showDoctor: boolean;
  /** Number of tracks in the library. */
  readonly trackCount: number;
  /** Pre-formatted, localized track count for display. */
  readonly trackCountLabel: string;
  /** Whether the library has any tracks (gates the danger zone). */
  readonly hasTracks: boolean;

  // --- Scan / clear ---
  /** Whether a scan is currently in progress. */
  readonly isScanning: boolean;
  /** Whether the rescan button is disabled (scanning or scan lock held). */
  readonly isRescanDisabled: boolean;
  /** Whether a library clear is in progress. */
  readonly isClearing: boolean;
  /** Whether the destructive "clear library" confirm UI is showing. */
  readonly confirmClear: boolean;
  /** Pre-formatted clear-confirmation prompt (track count interpolated). */
  readonly clearConfirmLabel: string;
  /** Trigger a library rescan. */
  readonly onRescan: () => void;
  /** Clear the entire library. */
  readonly onClearLibrary: () => void;
  /** Show or hide the clear-confirmation UI. */
  readonly onSetConfirmClear: (value: boolean) => void;

  // --- Backup ---
  /** Whether a DB backup export is in progress. */
  readonly isExporting: boolean;
  /** Whether a DB backup import is in progress. */
  readonly isImporting: boolean;
  /** Whether the export/import buttons are disabled (either op in flight). */
  readonly isBackupBusy: boolean;
  /** Export the library DB to a backup file. */
  readonly onExport: () => void;
  /** Import (replace) the library DB from a backup file. */
  readonly onImport: () => void;

  // --- Subfolder playlist dialog ---
  /** Whether the subfolder-playlist dialog is open. */
  readonly subfolderDialogOpen: boolean;
  /** Subfolders detected by the most recent scan. */
  readonly detectedSubfolders: SubfolderGroup[];
  /** Names of playlists that already exist. */
  readonly existingPlaylistNames: Set<string>;
  /** Open/close handler for the subfolder-playlist dialog. */
  readonly onDialogOpenChange: (open: boolean) => void;
  /** Confirm handler that creates playlists for the chosen subfolders. */
  readonly onSubfolderConfirm: (selectedSubfolders: ISubfolderEntry[]) => void;
}
