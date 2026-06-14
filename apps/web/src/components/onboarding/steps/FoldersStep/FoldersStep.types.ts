import type { useTranslation } from 'react-i18next';
import type { WatchedFolder } from '@/components/settings/MusicFoldersSection';
import type { SubfolderGroup } from '@/lib/scanHelpers';
import type { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type SubfolderConfirmFn = ReturnType<typeof useSubfolderPlaylistConfirm>;

export interface IFoldersStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Configured library folders. */
  readonly folders: WatchedFolder[];
  /** Whether any folder is configured. */
  readonly hasFolders: boolean;
  /** Whether a scan is currently running. */
  readonly isScanning: boolean;
  /** Whether the add-folder control is disabled (web / scanning / locked). */
  readonly addDisabled: boolean;
  /** Whether to show the desktop-only notice (web build). */
  readonly showDesktopNotice: boolean;
  /** Whether to show the "you can move on" hint (has folders, idle). */
  readonly showDoneHint: boolean;
  /** Whether the subfolder-as-playlist dialog is open. */
  readonly subfolderDialogOpen: boolean;
  /** Subfolders detected during the last scan, offered as playlists. */
  readonly detectedSubfolders: SubfolderGroup[];
  /** Existing playlist names, used to dedupe the subfolder offer. */
  readonly existingPlaylistNames: Set<string>;
  /** Open the OS folder picker and scan the chosen folder. */
  readonly onAddFolder: () => void;
  /** Remove a configured folder by id. */
  readonly onRemoveFolder: (id: string) => void;
  /** Open/close the subfolder-playlist dialog (clears detection on close). */
  readonly onSubfolderDialogOpenChange: (open: boolean) => void;
  /** Confirm the subfolder-as-playlist selection. */
  readonly onSubfolderConfirm: SubfolderConfirmFn;
}
