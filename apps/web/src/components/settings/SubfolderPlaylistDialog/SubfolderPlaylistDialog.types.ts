import type { useTranslation } from 'react-i18next';
import type { TrackMetadata } from '@/types/electron';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One detected subfolder offered as a playlist candidate. */
export interface ISubfolderEntry {
  readonly name: string;
  readonly path: string;
  readonly tracks: Array<{ filePath: string; metadata: TrackMetadata }>;
}

export interface ISubfolderPlaylistDialogProps {
  /** Whether the dialog is open. */
  readonly open: boolean;
  /** Called when the dialog requests open/close. */
  readonly onOpenChange: (open: boolean) => void;
  /** Detected subfolders to offer as playlists. */
  readonly subfolders: ISubfolderEntry[];
  /** Called with the user's selection when they confirm. */
  readonly onConfirm: (selectedSubfolders: ISubfolderEntry[]) => void;
  /** Optional set of playlist names that already exist (disables matching rows). */
  readonly existingPlaylistNames?: Set<string>;
}

/** One row in the subfolder list, with its derived selected/disabled state. */
export interface ISubfolderRow {
  /** Subfolder name (shown as the playlist name). */
  readonly name: string;
  /** Absolute subfolder path (stable row key + selection id). */
  readonly path: string;
  /** Number of tracks discovered in the subfolder. */
  readonly trackCount: number;
  /** Whether this subfolder is currently selected. */
  readonly isSelected: boolean;
  /** Whether a playlist with this name already exists (row is disabled). */
  readonly alreadyExists: boolean;
}

export interface ISubfolderPlaylistDialogView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Total number of detected subfolders (for the description copy). */
  readonly subfolderCount: number;
  /** Per-row view models, pre-resolved with selected/disabled flags. */
  readonly rows: readonly ISubfolderRow[];
  /** Whether the select-all control should render (more than one selectable row). */
  readonly showSelectAll: boolean;
  /** Whether every selectable row is selected (drives the all/none label). */
  readonly allSelected: boolean;
  /** Whether the confirm button is disabled (nothing selected). */
  readonly confirmDisabled: boolean;
  /** Toggle a single subfolder's selection by path. */
  readonly onToggleSubfolder: (path: string) => void;
  /** Select-all / deselect-all the selectable rows. */
  readonly onToggleAll: () => void;
  /** Confirm and create playlists for the current selection. */
  readonly onConfirm: () => void;
  /** Skip without creating any playlists. */
  readonly onSkip: () => void;
}
