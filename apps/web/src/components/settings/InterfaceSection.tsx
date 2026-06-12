import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, PanelTop, RotateCcw } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { TopBarPreview, OverviewLayoutPreview } from '@/components/settings/InterfacePreview';
import {
  useInterfaceStore,
  INTERFACE_DEFAULTS,
  type InterfaceElementKey,
} from '@/stores/useInterfaceStore';

type OverviewWidgetKey = Exclude<InterfaceElementKey, 'topBarLanguageSwitcher'>;

const OVERVIEW_TOGGLES: OverviewWidgetKey[] = [
  'overviewStats',
  'overviewTopWeek',
  'overviewClock',
  'overviewTopAlbums',
  'overviewMixes',
  'overviewRecommendations',
  'overviewRecentlyAdded',
];

export function InterfaceSection() {
  const { t } = useTranslation('settings');
  const state = useInterfaceStore();
  const { setVisible, resetInterface } = state;
  // Hovered settings row → spotlighted block in the Overview mock (mirrors
  // the SidebarSection ↔ SidebarPreview wiring).
  const [hoveredKey, setHoveredKey] = useState<OverviewWidgetKey | null>(null);

  const isModified = (Object.keys(INTERFACE_DEFAULTS) as InterfaceElementKey[]).some(
    key => state[key] !== INTERFACE_DEFAULTS[key]
  );

  return (
    <div className="space-y-4">
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
        <OverviewLayoutPreview highlightedKey={hoveredKey} />
        {OVERVIEW_TOGGLES.map((key, index) => (
          <div
            key={key}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => setHoveredKey(current => (current === key ? null : current))}
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
