import type { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import type { AlbumGridSize } from '@/stores/useUIStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPlaylistsViewView {
  /** Bound `playlists` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Bound `common` namespace translator for shared labels (retry, cancel). */
  readonly tCommon: TranslateFn;
  /** Playlists to render, in store order. */
  readonly playlists: readonly Playlist[];
  /** First load is in flight — show the skeleton. */
  readonly isLoading: boolean;
  /** Query failed — show the error state with retry. */
  readonly isError: boolean;
  /** No playlists exist — show the empty state. */
  readonly isEmpty: boolean;
  /** Current playlist grid density. */
  readonly gridSize: AlbumGridSize;
  /** Update the playlist grid density. */
  readonly setGridSize: (size: AlbumGridSize) => void;
  /** Tailwind grid classes derived from the current grid density. */
  readonly gridClassName: string;
  /** Card padding class derived from the current grid density. */
  readonly cardPaddingClass: string;
  /** Whether the inline create form is open. */
  readonly showNewForm: boolean;
  /** Open the inline create form. */
  readonly openNewForm: () => void;
  /** Close the inline create form and reset its name. */
  readonly closeNewForm: () => void;
  /** Current value of the new-playlist name input. */
  readonly newName: string;
  /** Update the new-playlist name input. */
  readonly setNewName: (name: string) => void;
  /** Whether the create mutation is in flight. */
  readonly isCreating: boolean;
  /** Whether the create button is enabled (a non-empty name and not pending). */
  readonly canCreate: boolean;
  /** Create the playlist from the current input value. */
  readonly onCreate: () => void;
  /** Keydown handler for the name input (Enter creates, Escape cancels). */
  readonly onNameKeyDown: (e: React.KeyboardEvent) => void;
  /** Open the detail view for a playlist. */
  readonly onSelectPlaylist: (id: string) => void;
  /** Retry loading after an error. */
  readonly onRetry: () => void;
}
