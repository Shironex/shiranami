import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import type { ContextMenuPosition } from '@/hooks/useContextMenuDismiss';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPlaylistContextMenuProps {
  /** Playlist the menu acts on (open / play / shuffle). */
  readonly playlist: Playlist;
  /** Anchor position for the menu (viewport-adjusted internally). */
  readonly position: ContextMenuPosition;
  /** Closes the menu. */
  readonly onClose: () => void;
}

export interface IPlaylistContextMenuView {
  /** Bound `contextMenu` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Ref for the menu surface — drives the dismiss + viewport-clamp behavior. */
  readonly menuRef: RefObject<HTMLDivElement | null>;
  /** Viewport-adjusted position the menu renders at. */
  readonly adjustedPosition: ContextMenuPosition;
  /** Navigate to the playlist detail view and close. */
  readonly onOpen: () => void;
  /** Load the playlist's tracks, set them as the queue, and close. */
  readonly onPlay: () => void;
  /** Load the playlist's tracks shuffled, set them as the queue, and close. */
  readonly onShuffle: () => void;
}
