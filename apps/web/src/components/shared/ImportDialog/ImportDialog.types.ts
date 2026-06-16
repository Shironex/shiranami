import type { useTranslation } from 'react-i18next';
import type { ImportData, UseShareImportResult } from '@/hooks/useShareImport';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** A single track row in the import preview, with its raw fields. */
export interface IImportTrack {
  readonly title: string;
  readonly artist: string;
  readonly ytId: string;
}

export interface IImportDialogProps {
  /** Whether the import dialog is open. */
  readonly open: boolean;
  /** Open-state controller (Radix `onOpenChange`). */
  readonly onOpenChange: (open: boolean) => void;
  /** The share code to resolve and import. */
  readonly code: string;
}

export interface IImportDialogView {
  /** Bound `share` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Import state-machine phase (`idle` | `loading` | `ready` | `downloading` | `done` | `error`). */
  readonly state: UseShareImportResult['state'];
  /** The resolved share payload (a track or playlist), or null before it loads. */
  readonly data: ImportData | null;
  /** Tracks-imported-so-far counter (used to drive per-row status). */
  readonly progress: number;
  /** Total number of tracks being imported. */
  readonly total: number;
  /** Editable playlist name (only meaningful for playlist imports). */
  readonly playlistName: string;
  /** Controlled setter for the playlist name input. */
  readonly setPlaylistName: (name: string) => void;
  /** Error message for the `error` state. */
  readonly error: string;
  /** The flattened track list to render in the preview. */
  readonly tracks: readonly IImportTrack[];
  /** Whether the resolved payload is a playlist (vs. a single track). */
  readonly isPlaylist: boolean;
  /** Percent-complete width string (e.g. `"40%"`) for the download progress bar. */
  readonly progressWidth: string;
  /** Start downloading + importing the shared tracks. */
  readonly startImport: () => void;
}
