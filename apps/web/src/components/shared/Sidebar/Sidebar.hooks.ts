import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { usePanelSizeStore } from '@/stores/usePanelSizeStore';
import { usePlaylistsQuery } from '@/hooks/queries/usePlaylists';
import {
  ALWAYS_VISIBLE_SIDEBAR_ITEMS,
  DEFAULT_SIDEBAR_ORDER,
  SIDEBAR_ITEM_BY_ID,
  type SidebarNavItem,
} from '@/lib/sidebar-items';
import type { Playlist } from '@/types/electron';
import type { ContextMenuPosition } from '@/components/shared/TrackContextMenu';
import type { ISidebarContextMenuState, ISidebarView } from './Sidebar.types';

export function useSidebar(): ISidebarView {
  const { t } = useTranslation('sidebar');
  const activeView = useViewStore(s => s.activeView);
  const selectedPlaylistId = useViewStore(s => s.selectedPlaylistId);
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const sidebarOrder = useUIStore(s => s.sidebarOrder);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);
  const landingView = useUIStore(s => s.landingView);
  const navigateTo = useViewStore(s => s.navigateTo);
  const toggleSidebarCollapsed = useUIStore(s => s.toggleSidebarCollapsed);
  const version = useAppVersion();
  const sidebarWidth = usePanelSizeStore(s => s.sidebarWidth);
  const setSidebarWidth = usePanelSizeStore(s => s.setSidebarWidth);
  const resetSidebarWidth = usePanelSizeStore(s => s.resetSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const { data: playlists = [], isLoading: isLoadingPlaylists } = usePlaylistsQuery();
  const [contextMenuState, setContextMenuState] = useState<ISidebarContextMenuState | null>(null);

  const onPlaylistContextMenu = useCallback((playlist: Playlist, position: ContextMenuPosition) => {
    setContextMenuState({ playlist, position });
  }, []);

  const versionLabel = `v${version}`;
  const fullVersionLabel = `${t('shiranami', { ns: 'common' })} ${versionLabel}`;
  const sidebarVersionLabel = sidebarCollapsed ? versionLabel : fullVersionLabel;

  // Resolve the user-chosen order to nav items, dropping any hidden ones. Falls
  // back to the default order when `sidebarOrder` is empty (fresh install or a
  // test that doesn't seed it) so the nav is never blank.
  const visibleNavItems = useMemo<SidebarNavItem[]>(() => {
    const order = sidebarOrder?.length ? sidebarOrder : DEFAULT_SIDEBAR_ORDER;
    return order
      .map(id => SIDEBAR_ITEM_BY_ID.get(id))
      .filter(
        (item): item is SidebarNavItem =>
          item != null &&
          (ALWAYS_VISIBLE_SIDEBAR_ITEMS.has(item.id) || !sidebarHiddenItems.includes(item.id))
      );
  }, [sidebarOrder, sidebarHiddenItems]);

  const showPlaylistsSection =
    sidebarPlaylistsVisible && (isLoadingPlaylists || playlists.length > 0);

  return {
    t,
    activeView,
    selectedPlaylistId,
    sidebarCollapsed,
    sidebarPlaylistsVisible,
    sidebarWidth,
    isResizing,
    visibleNavItems,
    playlists,
    isLoadingPlaylists,
    showPlaylistsSection,
    sidebarVersionLabel,
    fullVersionLabel,
    contextMenuState,
    navigateTo,
    onOpenHome: () => navigateTo(landingView),
    toggleSidebarCollapsed,
    setSidebarWidth,
    resetSidebarWidth,
    setIsResizing,
    onPlaylistContextMenu,
    onCloseContextMenu: () => setContextMenuState(null),
  };
}
