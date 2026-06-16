import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';
import type { ContextMenuPosition } from '@/hooks/useContextMenuDismiss';

// Re-export the position alias under its established name so external consumers
// (`TrackRowContent`, `Sidebar`) keep importing it from
// `@/components/shared/TrackContextMenu` — the folder barrel carries it through.
export type { ContextMenuPosition };

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ITrackContextMenuProps {
  /** Track the menu acts on (the right-clicked row). */
  readonly track: Track;
  /** Anchor position for the menu (viewport-adjusted internally). */
  readonly position: ContextMenuPosition;
  /** Closes the menu. */
  readonly onClose: () => void;
}

export interface ITrackContextMenuView {
  /** Bound `contextMenu` namespace translator. */
  readonly t: TranslateFn;
  /** Ref for the menu surface — drives the dismiss + viewport-clamp behavior. */
  readonly menuRef: RefObject<HTMLDivElement | null>;
  /** Viewport-adjusted position the menu renders at. */
  readonly adjustedPosition: ContextMenuPosition;
  /** True when acting on a multi-selection that includes the right-clicked track. */
  readonly isBulk: boolean;
  /** Number of target tracks (selection size when bulk, else 1). */
  readonly count: number;
  /** Target track ids — the whole selection when bulk, else just this track. */
  readonly targetTrackIds: string[];
  /** Whether the (single-track) favorite glyph should render filled. */
  readonly isFavorite: boolean;
  /** A bulk enrich run holds the abort slot — disables the per-track enrich entry. */
  readonly isBulkEnriching: boolean;
  /** Play the target track(s) next. */
  readonly onPlayNext: () => void;
  /** Append the target track(s) to the queue. */
  readonly onAddToQueue: () => void;
  /** Toggle favorite for the target track(s). */
  readonly onToggleFavorite: () => void;
  /** Build a song-radio queue from this track (single-track only). */
  readonly onMoreLikeThis: () => void;
  /** Mark this track "Not interested" (single-track only). */
  readonly onNotInterested: () => void;
  /** Reveal the file in the OS file manager (single-track only). */
  readonly onShowInFolder: () => void;
  /** Open the share dialog for this track (single-track only). */
  readonly onShare: () => void;
  /** Open the metadata-enrich dialog for this track (single-track only). */
  readonly onFindMissingMetadata: () => void;
  /** Open the edit-tags dialog for this track (single-track only). */
  readonly onEditTags: () => void;
  /** Remove the target track(s) from the library. */
  readonly onRemoveFromLibrary: () => void;
  /** Remove the target track(s) from the library and delete the files. */
  readonly onDeleteFromDisk: () => void;
  /** Closes the menu after clearing the selection (passed to the playlist submenu). */
  readonly onClearAndClose: () => void;
}
