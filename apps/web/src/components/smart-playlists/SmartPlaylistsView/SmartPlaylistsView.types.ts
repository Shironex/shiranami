import type { SmartPlaylist } from '@shiranami/contracts';
import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ISmartPlaylistsViewView {
  /** Bound `smartPlaylists` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Currently selected smart playlist id — when set, the detail view renders instead of the grid. */
  readonly selectedId: string | null;
  /** Hold the loading skeleton until the first list query settles. */
  readonly showSkeleton: boolean;
  /** The list query errored — show the retry error state. */
  readonly showError: boolean;
  /** Localized label for the error-state retry action (from the `common` namespace). */
  readonly retryLabel: string;
  /** No smart playlists exist (drives the empty state vs. the grid). */
  readonly isEmpty: boolean;
  /** Smart playlists sorted by name for the grid. */
  readonly sorted: readonly SmartPlaylist[];
  /** Create-dialog open state. */
  readonly createOpen: boolean;
  /** Controls the create-dialog open state. */
  readonly setCreateOpen: (open: boolean) => void;
  /** Selects a smart playlist by id, switching to its detail view. */
  readonly onOpen: (id: string) => void;
  /** Opens the create dialog. */
  readonly onCreate: () => void;
  /** Refetches the list after an error. */
  readonly onRetry: () => void;
}
