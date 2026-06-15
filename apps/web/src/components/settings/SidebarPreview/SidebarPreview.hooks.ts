import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import {
  ALWAYS_VISIBLE_SIDEBAR_ITEMS,
  DEFAULT_SIDEBAR_ORDER,
  SIDEBAR_ITEM_BY_ID,
  type SidebarNavItem,
} from '@/lib/sidebar-items';
import type {
  ISidebarPreviewItem,
  ISidebarPreviewProps,
  ISidebarPreviewView,
} from './SidebarPreview.types';

export function useSidebarPreview({
  highlightedId = null,
}: ISidebarPreviewProps): ISidebarPreviewView {
  const { t } = useTranslation('settings');
  const { t: ts } = useTranslation('sidebar');
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const sidebarOrder = useUIStore(s => s.sidebarOrder);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);

  const visibleItems = useMemo(() => {
    const order = sidebarOrder?.length ? sidebarOrder : DEFAULT_SIDEBAR_ORDER;
    return order
      .map(id => SIDEBAR_ITEM_BY_ID.get(id))
      .filter(
        (item): item is SidebarNavItem =>
          item != null &&
          (ALWAYS_VISIBLE_SIDEBAR_ITEMS.has(item.id) || !sidebarHiddenItems.includes(item.id))
      );
  }, [sidebarOrder, sidebarHiddenItems]);

  // Spotlight the hovered row when it's visible; otherwise fall back to the
  // first item so the mock always reads as a real, "landed" sidebar.
  const activeId =
    highlightedId && visibleItems.some(item => item.id === highlightedId)
      ? highlightedId
      : visibleItems[0]?.id;

  const items: ISidebarPreviewItem[] = visibleItems.map(item => ({
    id: item.id,
    Icon: item.Icon,
    label: ts(item.key),
    active: item.id === activeId,
  }));

  return {
    title: t('app.sidebarPreview'),
    items,
    showPlaylists: sidebarPlaylistsVisible,
  };
}
