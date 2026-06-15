import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useInterfaceStore,
  INTERFACE_DEFAULTS,
  type InterfaceElementKey,
} from '@/stores/useInterfaceStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import type {
  IInterfaceSectionView,
  IInterfaceToggle,
  OverviewWidgetKey,
  PlayerElementKey,
} from './InterfaceSection.types';

const OVERVIEW_TOGGLES: OverviewWidgetKey[] = [
  'overviewStats',
  'overviewTopWeek',
  'overviewClock',
  'overviewTopAlbums',
  'overviewMixes',
  'overviewRecommendations',
  'overviewRecentlyAdded',
];

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
  const { setVisible, resetInterface } = state;
  // Hovered settings row → spotlighted block in the matching mock (mirrors
  // the SidebarSection ↔ SidebarPreview wiring).
  const [hoveredOverviewKey, setHoveredOverviewKey] = useState<OverviewWidgetKey | null>(null);
  const [hoveredPlayerKey, setHoveredPlayerKey] = useState<PlayerElementKey | null>(null);

  const sidePanelSide = useLayoutStore(s => s.sidePanelSide);
  const setSidePanelSide = useLayoutStore(s => s.setSidePanelSide);

  const isModified = (Object.keys(INTERFACE_DEFAULTS) as InterfaceElementKey[]).some(
    key => state[key] !== INTERFACE_DEFAULTS[key]
  );

  const overviewToggles: IInterfaceToggle<OverviewWidgetKey>[] = OVERVIEW_TOGGLES.map(
    (key, index) => ({
      key,
      label: t(`app.interface.elements.${key}`),
      description: t(`app.interface.elements.${key}Desc`),
      checked: state[key],
      divider: index > 0,
    })
  );

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

    overviewToggles,
    hoveredOverviewKey,
    onHoverOverview,

    playerToggles,
    hoveredPlayerKey,
    onHoverPlayer,

    onSetVisible: setVisible,
  };
}
