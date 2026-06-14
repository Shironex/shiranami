import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, PanelBottom, PanelRight, PanelTop, RotateCcw } from 'lucide-react';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsSelectRow,
} from '@/components/settings/SettingsCard';
import {
  LayoutPreview,
  TopBarPreview,
  OverviewLayoutPreview,
  PlayerBarPreview,
} from '@/components/settings/InterfacePreview';
import {
  useInterfaceStore,
  INTERFACE_DEFAULTS,
  type InterfaceElementKey,
} from '@/stores/useInterfaceStore';
import { useLayoutStore, type SidePanelSide } from '@/stores/useLayoutStore';

type OverviewWidgetKey = Extract<InterfaceElementKey, `overview${string}`>;
type PlayerElementKey = Extract<InterfaceElementKey, `player${string}`>;

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

export function InterfaceSection() {
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

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={PanelRight}
        title={t('app.interface.layoutTitle')}
        subtitle={t('app.interface.layoutDesc')}
      >
        <LayoutPreview />
        <SettingsSelectRow
          label={t('app.interface.sidePanelPosition')}
          description={t('app.interface.sidePanelPositionDesc')}
          value={sidePanelSide}
          onValueChange={v => setSidePanelSide(v as SidePanelSide)}
          options={[
            { value: 'left', label: t('app.interface.positionLeft') },
            { value: 'right', label: t('app.interface.positionRight') },
          ]}
        />
      </SettingsCard>

      <SettingsCard
        icon={PanelTop}
        title={t('app.interface.topBarTitle')}
        subtitle={t('app.interface.topBarDesc')}
        headerRight={
          isModified ? (
            <button
              onClick={resetInterface}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('app.interface.reset')}
            >
              <RotateCcw className="size-3" />
              {t('app.interface.reset')}
            </button>
          ) : undefined
        }
      >
        <SettingsToggleRow
          label={t('app.interface.elements.topBarLanguageSwitcher')}
          description={t('app.interface.elements.topBarLanguageSwitcherDesc')}
          checked={state.topBarLanguageSwitcher}
          onCheckedChange={v => setVisible('topBarLanguageSwitcher', v)}
        />
        <TopBarPreview enabled={state.topBarLanguageSwitcher} />
      </SettingsCard>

      <SettingsCard
        icon={LayoutDashboard}
        title={t('app.interface.overviewTitle')}
        subtitle={t('app.interface.overviewDesc')}
      >
        <OverviewLayoutPreview highlightedKey={hoveredOverviewKey} />
        {OVERVIEW_TOGGLES.map((key, index) => (
          <div
            key={key}
            onMouseEnter={() => setHoveredOverviewKey(key)}
            onMouseLeave={() =>
              setHoveredOverviewKey(current => (current === key ? null : current))
            }
          >
            <SettingsToggleRow
              label={t(`app.interface.elements.${key}`)}
              description={t(`app.interface.elements.${key}Desc`)}
              checked={state[key]}
              onCheckedChange={v => setVisible(key, v)}
              divider={index > 0}
            />
          </div>
        ))}
      </SettingsCard>

      <SettingsCard
        icon={PanelBottom}
        title={t('app.interface.playerTitle')}
        subtitle={t('app.interface.playerDesc')}
      >
        <PlayerBarPreview highlightedKey={hoveredPlayerKey} />
        {PLAYER_TOGGLES.map((key, index) => (
          <div
            key={key}
            onMouseEnter={() => setHoveredPlayerKey(key)}
            onMouseLeave={() => setHoveredPlayerKey(current => (current === key ? null : current))}
          >
            <SettingsToggleRow
              label={t(`app.interface.elements.${key}`)}
              description={t(`app.interface.elements.${key}Desc`)}
              checked={state[key]}
              onCheckedChange={v => setVisible(key, v)}
              divider={index > 0}
            />
          </div>
        ))}
      </SettingsCard>
    </div>
  );
}
