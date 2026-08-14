import type { RefObject } from 'react';

export interface IPlaylistSubmenuProps {
  /** Tracks the nested picker adds to / removes from a playlist. */
  readonly trackIds: string[];
  /** Closes the parent context menu once the picker resolves. */
  readonly onClose: () => void;
}

export interface IPlaylistSubmenuView {
  /** Localized "Add to Playlist" row label. */
  readonly label: string;
  /** Tracks forwarded to the nested picker. */
  readonly trackIds: string[];
  /** Close handler forwarded to the nested picker. */
  readonly onClose: () => void;
  /** Ref for the hoverable row wrapper — measured to pick the fly-out side. */
  readonly parentRef: RefObject<HTMLDivElement | null>;
  /** Ref for the row button — the roving menuitem the track menu focuses. */
  readonly rowRef: RefObject<HTMLButtonElement | null>;
  /** Ref for the fly-out panel. */
  readonly submenuRef: RefObject<HTMLDivElement | null>;
  /** Whether the fly-out panel is mounted. */
  readonly isSubmenuOpen: boolean;
  /** Class list for the fly-out panel, including the resolved left/right side. */
  readonly submenuClassName: string;
  /** Opens the fly-out, cancelling any pending close. */
  readonly onMouseEnter: () => void;
  /** Starts the grace period before the fly-out closes. */
  readonly onMouseLeave: () => void;
  /** Row keyboard handling: Enter/Space/ArrowRight open, ArrowLeft closes. */
  readonly onRowKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}
