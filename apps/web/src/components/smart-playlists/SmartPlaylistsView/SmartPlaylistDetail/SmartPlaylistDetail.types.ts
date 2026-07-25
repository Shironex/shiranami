import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { SmartPlaylist } from '@shiranami/contracts';
import type { ITrackRowProps } from '@/components/shared/TrackRow';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ISmartPlaylistDetailProps {
  /** Id of the smart playlist to show. */
  readonly id: string;
}

export interface ISmartPlaylistDetailView {
  /** Bound `smartPlaylists` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Bound `common` namespace translator for the shared edit/delete/cancel labels. */
  readonly tCommon: TranslateFn;
  /** The loaded playlist — null/undefined renders the not-found state. */
  readonly playlist: SmartPlaylist | null | undefined;
  /** Hold the centered spinner until the playlist metadata query settles. */
  readonly showMetaLoader: boolean;
  /** Hold the centered spinner until the matching-tracks query settles. */
  readonly showTracksLoader: boolean;
  /** Localized "{{count}} matching tracks" line under the playlist name. */
  readonly matchCountLabel: string;
  /** No track matches the rules — render the empty state instead of the list. */
  readonly hasNoTracks: boolean;
  /** Number of rows the virtualized list renders. */
  readonly rowCount: number;
  /** Stable props object passed through to each virtualized track row. */
  readonly rowProps: ITrackRowProps;
  /** Anchor for the delete-confirmation popover (its click-outside target). */
  readonly deleteRef: RefObject<HTMLDivElement | null>;
  /** Whether the delete-confirmation popover is open. */
  readonly showDeleteConfirm: boolean;
  /** A delete is in flight — the confirm button is disabled until it settles. */
  readonly isDeleting: boolean;
  /** Edit-dialog open state. */
  readonly editOpen: boolean;
  /** Controls the edit-dialog open state. */
  readonly setEditOpen: (open: boolean) => void;
  /** Opens the edit dialog. */
  readonly onEdit: () => void;
  /** Toggles the delete-confirmation popover. */
  readonly onToggleDeleteConfirm: () => void;
  /** Dismisses the delete-confirmation popover without deleting. */
  readonly onCancelDelete: () => void;
  /** Deletes the playlist and returns to the grid; keeps the popover open on failure. */
  readonly onDelete: () => void;
  /** Clears the selection, returning to the smart-playlists grid. */
  readonly onBack: () => void;
}
