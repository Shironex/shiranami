import { useState } from 'react';
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
  useInterfaceStore,
  INTERFACE_DEFAULTS,
  INTERFACE_TOGGLE_KEYS,
} from '@/stores/useInterfaceStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import {
  DEFAULT_OVERVIEW_ORDER,
  OVERVIEW_SECTION_BY_ID,
  type OverviewSection,
  type OverviewSectionId,
} from '@/lib/overview-sections';
import type {
  IInterfaceSectionView,
  IInterfaceToggle,
  IOverviewSectionRow,
  OverviewWidgetKey,
  PlayerElementKey,
} from './InterfaceSection.types';

const PLAYER_TOGGLES: PlayerElementKey[] = [
  'playerAlbumArt',
  'playerFavorite',
  'playerTimeLabels',
  'playerWaveformSeekbar',
  'playerSleepTimer',
  'playerEqualizer',
  'playerCompactButton',
  'playerVisualizerButton',
  'playerLyricsButton',
  'playerQueueButton',
  'playerVolume',
];

export function useInterfaceSection(): IInterfaceSectionView {
  const { t } = useTranslation('settings');
  const state = useInterfaceStore();
  const { setVisible, reorderOverviewSection, resetInterface } = state;
  // Hovered settings row → spotlighted block in the matching mock (mirrors
  // the SidebarSection ↔ SidebarPreview wiring).
  const [hoveredOverviewKey, setHoveredOverviewKey] = useState<OverviewWidgetKey | null>(null);
  const [hoveredPlayerKey, setHoveredPlayerKey] = useState<PlayerElementKey | null>(null);

  const sidePanelSide = useLayoutStore(s => s.sidePanelSide);
  const setSidePanelSide = useLayoutStore(s => s.setSidePanelSide);

  const overviewSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isModified =
    INTERFACE_TOGGLE_KEYS.some(key => state[key] !== INTERFACE_DEFAULTS[key]) ||
    state.overviewOrder.join() !== DEFAULT_OVERVIEW_ORDER.join();

  // Render sections in the user-chosen order. The store reconciles the order
  // on rehydrate, so every id resolves; the filter is a type guard.
  const orderedSections = state.overviewOrder
    .map(id => OVERVIEW_SECTION_BY_ID.get(id))
    .filter((section): section is OverviewSection => section != null);

  const overviewSections: IOverviewSectionRow[] = orderedSections.map(section => {
    const label = t(`app.interface.elements.${section.labelKey}`);
    return {
      id: section.id,
      label,
      dragHandleLabel: t('app.interface.overviewDragHandle', { label }),
      toggles: section.toggles.map(
        (key, index): IInterfaceToggle<OverviewWidgetKey> => ({
          key,
          label: t(`app.interface.elements.${key}`),
          description: t(`app.interface.elements.${key}Desc`),
          checked: state[key],
          divider: index > 0,
        })
      ),
    };
  });

  const playerToggles: IInterfaceToggle<PlayerElementKey>[] = PLAYER_TOGGLES.map((key, index) => ({
    key,
    label: t(`app.interface.elements.${key}`),
    description: t(`app.interface.elements.${key}Desc`),
    checked: state[key],
    divider: index > 0,
  }));

  function onHoverOverview(key: OverviewWidgetKey, hovering: boolean): void {
    setHoveredOverviewKey(current => (hovering ? key : current === key ? null : current));
  }

  function onHoverPlayer(key: PlayerElementKey, hovering: boolean): void {
    setHoveredPlayerKey(current => (hovering ? key : current === key ? null : current));
  }

  function onReorderOverview(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderOverviewSection(active.id as OverviewSectionId, over.id as OverviewSectionId);
    }
  }

  return {
    t,
    isModified,
    onResetInterface: resetInterface,

    sidePanelSide,
    sideOptions: [
      { value: 'left', label: t('app.interface.positionLeft') },
      { value: 'right', label: t('app.interface.positionRight') },
    ],
    onSelectSide: setSidePanelSide,

    topBarLanguageSwitcher: state.topBarLanguageSwitcher,
    onToggleTopBarLanguageSwitcher: visible => setVisible('topBarLanguageSwitcher', visible),

    overviewSections,
    overviewOrderIds: orderedSections.map(section => section.id),
    overviewReorderHint: t('app.interface.overviewReorderHint'),
    overviewSensors,
    onReorderOverview,
    hoveredOverviewKey,
    onHoverOverview,

    playerToggles,
    hoveredPlayerKey,
    onHoverPlayer,

    onSetVisible: setVisible,
  };
}
