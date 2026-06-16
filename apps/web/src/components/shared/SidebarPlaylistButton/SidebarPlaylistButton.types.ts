import type { Playlist } from '@/types/electron';
import type { ContextMenuPosition } from '@/hooks/useContextMenuDismiss';

export interface ISidebarPlaylistButtonProps {
  readonly playlist: Playlist;
  readonly collapsed: boolean;
  readonly isActive: boolean;
  readonly onNavigate: (id: string) => void;
  readonly onContextMenu: (playlist: Playlist, position: ContextMenuPosition) => void;
}

export interface ISidebarPlaylistButtonView {
  /** The playlist row's model. */
  readonly playlist: Playlist;
  /** Collapsed (icon-only) vs expanded (icon + name) layout. */
  readonly collapsed: boolean;
  /** Whether this is the currently selected playlist. */
  readonly isActive: boolean;
  /** Navigate to this playlist. */
  readonly onNavigate: (id: string) => void;
  /** Open the playlist context menu at the pointer position. */
  readonly onContextMenu: (event: React.MouseEvent) => void;
}
