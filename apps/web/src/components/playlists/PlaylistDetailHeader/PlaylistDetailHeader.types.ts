import type { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import type { usePlaylistCover } from '@/hooks/usePlaylistCover';

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type PlaylistCover = ReturnType<typeof usePlaylistCover>;

export interface IPlaylistDetailHeaderProps {
  /** The playlist being shown — name and cover art come from here. */
  readonly playlist: Playlist;
  /** Currently-open playlist id, used to gate the share button. */
  readonly selectedPlaylistId: string | null;
  /** Number of tracks, rendered in the subtitle. */
  readonly trackCount: number;
  /** Total duration in seconds, formatted in the subtitle. */
  readonly totalDuration: number;
  /** Whether the playlist has any tracks (enables Play All). */
  readonly hasTracks: boolean;
  /** A track's album art, offered as a one-click cover suggestion. */
  readonly suggestedCoverArt?: string;
  /** Cover-art menu controller from `usePlaylistCover`. */
  readonly cover: PlaylistCover;
  /** Whether the name is in inline-edit mode. */
  readonly isEditing: boolean;
  /** Current value of the inline name editor. */
  readonly editName: string;
  /** Update the inline name editor value. */
  readonly setEditName: (name: string) => void;
  /** Ref focused when inline editing begins. */
  readonly nameInputRef: React.RefObject<HTMLInputElement | null>;
  /** Whether the delete-confirmation popover is open. */
  readonly showDeleteConfirm: boolean;
  /** Controls the delete-confirmation popover. */
  readonly setShowDeleteConfirm: (show: boolean) => void;
  /** Navigate back to the playlists grid. */
  readonly onBack: () => void;
  /** Play the whole playlist from the top. */
  readonly onPlayAll: () => void;
  /** Delete the playlist. */
  readonly onDelete: () => void;
  /** Enter inline name-edit mode. */
  readonly onStartEdit: () => void;
  /** Commit the inline name edit. */
  readonly onSaveName: () => void;
  /** Keydown handler for the inline name editor (Enter saves, Escape cancels). */
  readonly onNameKeyDown: (e: React.KeyboardEvent) => void;
}

export interface IPlaylistDetailHeaderView {
  /** Bound `playlists` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Bound `share` namespace translator for the share button label. */
  readonly tShare: TranslateFn;
  /** Bound `common` namespace translator for shared labels (delete, cancel). */
  readonly tCommon: TranslateFn;
  /** Whether the formatted-duration suffix should render. */
  readonly showDuration: boolean;
  /** Pre-formatted duration string (e.g. "12:34"), empty when not shown. */
  readonly durationLabel: string;
  /** Whether the share button renders (Electron + a selected playlist). */
  readonly showShareButton: boolean;
  /** Open the OS share dialog for this playlist. */
  readonly onShare: () => void;
  /** Whether the cover menu is open. */
  readonly showCoverMenu: boolean;
  /** Toggle the cover menu open state. */
  readonly setShowCoverMenu: PlaylistCover['setShowCoverMenu'];
  /** Whether a cover-art update is in flight. */
  readonly isUpdatingCover: boolean;
  /** Ref for the cover-menu popover (click-outside anchor). */
  readonly coverMenuRef: PlaylistCover['coverMenuRef'];
  /** Ref for the hidden file input used to pick a custom cover. */
  readonly coverInputRef: PlaylistCover['coverInputRef'];
  /** Handle a selected cover-art file. */
  readonly handleCoverFileSelected: PlaylistCover['handleCoverFileSelected'];
  /** Open the file picker for a custom cover. */
  readonly handlePickCustomCover: PlaylistCover['handlePickCustomCover'];
  /** Use the suggested track artwork as the cover. */
  readonly handleUseSuggestedCover: PlaylistCover['handleUseSuggestedCover'];
  /** Clear the current cover art. */
  readonly handleClearCover: PlaylistCover['handleClearCover'];
}
