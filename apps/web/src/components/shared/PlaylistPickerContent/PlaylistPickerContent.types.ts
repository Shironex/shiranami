import type { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPlaylistPickerContentProps {
  /** Track ids the picker adds to / removes from a playlist. */
  readonly trackIds: string[];
  /** Called after a successful membership change or create-and-add. */
  readonly onDone: () => void;
  /**
   * Forces the toast wording. When omitted, falls back to plural wording for
   * more than one track and singular otherwise.
   */
  readonly toastMode?: 'single' | 'bulk';
}

export interface IPlaylistPickerContentView {
  /** Bound `common` namespace translator (the shell stays free of `useTranslation`). */
  readonly tCommon: TranslateFn;
  /** Playlists are still loading — render the spinner instead of the list. */
  readonly isLoading: boolean;
  /** All playlists to list (each toggles membership for the target tracks). */
  readonly playlists: readonly Playlist[];
  /** Whether a given playlist already contains the target track(s). */
  readonly isMember: (playlistId: string) => boolean;
  /** Any membership/create mutation is in flight — rows go non-interactive. */
  readonly isMutating: boolean;
  /** Toggles the target track(s) in/out of the given playlist. */
  readonly onToggle: (playlist: Playlist) => void;
  /** Whether the inline "new playlist" name form is showing. */
  readonly showNewForm: boolean;
  /** Reveals the inline new-playlist name form. */
  readonly onShowNewForm: () => void;
  /** Hides the new-playlist form and clears its draft name. */
  readonly onCancelNewForm: () => void;
  /** Draft name in the new-playlist input. */
  readonly newName: string;
  /** Updates the draft new-playlist name. */
  readonly onNewNameChange: (value: string) => void;
  /** Creates a playlist from the draft name and adds the target track(s). */
  readonly onCreateAndAdd: () => void;
}
