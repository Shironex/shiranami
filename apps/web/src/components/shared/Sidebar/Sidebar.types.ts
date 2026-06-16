import type { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import type { SidebarNavItem } from '@/lib/sidebar-items';
import type { AppView } from '@/stores/useViewStore';
import type { ContextMenuPosition } from '@/components/shared/TrackContextMenu';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ISidebarContextMenuState {
  readonly playlist: Playlist;
  readonly position: ContextMenuPosition;
}

export interface ISidebarView {
  /** Bound `sidebar` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** The currently active top-level view (drives the active nav highlight). */
  readonly activeView: string;
  /** The selected playlist id (drives the active playlist-row highlight). */
  readonly selectedPlaylistId: string | null;
  /** Whether the sidebar is collapsed to its icon-rail width. */
  readonly sidebarCollapsed: boolean;
  /** Whether the playlists section is shown. */
  readonly sidebarPlaylistsVisible: boolean;
  /** Persisted resizable width (px), applied inline when expanded. */
  readonly sidebarWidth: number;
  /** Whether the resize drag is in progress (suspends the width transition). */
  readonly isResizing: boolean;
  /** Nav items resolved to the user's order, with hidden items dropped. */
  readonly visibleNavItems: readonly SidebarNavItem[];
  /** The fetched playlists for the playlists section. */
  readonly playlists: readonly Playlist[];
  /** Whether the playlists query is still loading (shows a spinner). */
  readonly isLoadingPlaylists: boolean;
  /** Whether the playlists section should render at all. */
  readonly showPlaylistsSection: boolean;
  /** The version label shown at the foot of the sidebar. */
  readonly sidebarVersionLabel: string;
  /** Full "Shiranami vX.Y.Z" label (used for the collapsed row's title). */
  readonly fullVersionLabel: string;
  /** The open playlist context menu, or null. */
  readonly contextMenuState: ISidebarContextMenuState | null;
  /** Navigate to a view (optionally selecting a playlist). */
  readonly navigateTo: (view: AppView, playlistId?: string | null) => void;
  /** Navigate to the configured landing view from the logo. */
  readonly onOpenHome: () => void;
  /** Toggle the collapsed/expanded sidebar. */
  readonly toggleSidebarCollapsed: () => void;
  /** Commit a new sidebar width. */
  readonly setSidebarWidth: (v: number) => void;
  /** Reset the sidebar width to its default. */
  readonly resetSidebarWidth: () => void;
  /** Track whether the resize drag is active. */
  readonly setIsResizing: (dragging: boolean) => void;
  /** Open the playlist context menu for a row. */
  readonly onPlaylistContextMenu: (playlist: Playlist, position: ContextMenuPosition) => void;
  /** Close the playlist context menu. */
  readonly onCloseContextMenu: () => void;
}
