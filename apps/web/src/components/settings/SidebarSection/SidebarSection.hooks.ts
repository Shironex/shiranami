import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  ALWAYS_VISIBLE_SIDEBAR_ITEMS,
  DEFAULT_SIDEBAR_ORDER,
  EXPERIMENTAL_SIDEBAR_ITEMS,
  SIDEBAR_ITEM_BY_ID,
  type SidebarNavItem,
} from '@/lib/sidebar-items';
import { useUIStore } from '@/stores/useUIStore';
import type { AppView } from '@/stores/useViewStore';
import type { ISidebarSectionRow, ISidebarSectionView } from './SidebarSection.types';

export function useSidebarSection(): ISidebarSectionView {
  const { t } = useTranslation('settings');
  const { t: ts } = useTranslation('sidebar');
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const sidebarOrder = useUIStore(s => s.sidebarOrder);
  const toggleSidebarItem = useUIStore(s => s.toggleSidebarItem);
  const reorderSidebarItem = useUIStore(s => s.reorderSidebarItem);
  const resetSidebar = useUIStore(s => s.resetSidebar);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);
  const setSidebarPlaylistsVisible = useUIStore(s => s.setSidebarPlaylistsVisible);
  const landingView = useUIStore(s => s.landingView);
  const setLandingView = useUIStore(s => s.setLandingView);
  const [hoveredId, setHoveredId] = useState<AppView | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Render rows in the user-chosen order; fall back to the default for any id
  // not yet present (fresh install). Always a complete, deduped list.
  const orderedItems = useMemo<SidebarNavItem[]>(() => {
    const order = sidebarOrder?.length ? sidebarOrder : DEFAULT_SIDEBAR_ORDER;
    return order
      .map(id => SIDEBAR_ITEM_BY_ID.get(id))
      .filter((item): item is SidebarNavItem => item != null);
  }, [sidebarOrder]);
  const orderedIds = useMemo(() => orderedItems.map(item => item.id), [orderedItems]);

  const rows: ISidebarSectionRow[] = orderedItems.map(item => {
    const alwaysOn = ALWAYS_VISIBLE_SIDEBAR_ITEMS.has(item.id);
    const visible = alwaysOn || !sidebarHiddenItems.includes(item.id);
    const label = ts(item.key);
    return {
      id: item.id,
      Icon: item.Icon,
      label,
      alwaysOn,
      visible,
      experimental: EXPERIMENTAL_SIDEBAR_ITEMS.has(item.id),
      dragHandleLabel: t('app.sidebarDragHandle', { label }),
    };
  });

  function onHoverItem(id: AppView, hovering: boolean): void {
    setHoveredId(prev => (hovering ? id : prev === id ? null : prev));
  }

  function onDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderSidebarItem(active.id as AppView, over.id as AppView);
    }
  }

  return {
    t,
    sensors,
    rows,
    orderedIds,
    hoveredId,

    alwaysOnLabel: t('app.sidebarAlwaysOn'),
    experimentalLabel: t('app.sidebarExperimental'),

    landingView,
    landingOptions: [
      { value: 'overview', label: ts('overview') },
      { value: 'library', label: ts('library') },
    ],
    onSelectLandingView: setLandingView,

    playlistsVisible: sidebarPlaylistsVisible,
    onSetPlaylistsVisible: setSidebarPlaylistsVisible,

    onToggleItem: toggleSidebarItem,
    onHoverItem,
    onDragEnd,
    onReset: resetSidebar,
  };
}
