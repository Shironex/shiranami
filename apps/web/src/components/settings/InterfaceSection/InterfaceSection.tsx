import { LayoutDashboard, PanelBottom, PanelRight, PanelTop, RotateCcw } from 'lucide-react';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsSelectRow,
} from '@/components/settings/SettingsCard';
import { CompanionSection } from '@/components/settings/CompanionSection';
import { LayoutPreview } from '@/components/settings/LayoutPreview';
import { TopBarPreview } from '@/components/settings/TopBarPreview';
import { OverviewLayoutPreview } from '@/components/settings/OverviewLayoutPreview';
import { PlayerBarPreview } from '@/components/settings/PlayerBarPreview';
import { useInterfaceSection } from './InterfaceSection.hooks';

export default function InterfaceSection() {
  const {
    t,
    isModified,
    onResetInterface,
    sidePanelSide,
    sideOptions,
    onSelectSide,
    topBarLanguageSwitcher,
    onToggleTopBarLanguageSwitcher,
    overviewToggles,
    hoveredOverviewKey,
    onHoverOverview,
    playerToggles,
    hoveredPlayerKey,
    onHoverPlayer,
    onSetVisible,
  } = useInterfaceSection();

  const overviewRows = overviewToggles.map(row => (
    <div
      key={row.key}
      onMouseEnter={() => onHoverOverview(row.key, true)}
      onMouseLeave={() => onHoverOverview(row.key, false)}
    >
      <SettingsToggleRow
        label={row.label}
        description={row.description}
        checked={row.checked}
        onCheckedChange={v => onSetVisible(row.key, v)}
        divider={row.divider}
      />
    </div>
  ));

  const playerRows = playerToggles.map(row => (
    <div
      key={row.key}
      onMouseEnter={() => onHoverPlayer(row.key, true)}
      onMouseLeave={() => onHoverPlayer(row.key, false)}
    >
      <SettingsToggleRow
        label={row.label}
        description={row.description}
        checked={row.checked}
        onCheckedChange={v => onSetVisible(row.key, v)}
        divider={row.divider}
      />
    </div>
  ));

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
          onValueChange={v => onSelectSide(v as typeof sidePanelSide)}
          options={sideOptions}
        />
      </SettingsCard>

      <SettingsCard
        icon={PanelTop}
        title={t('app.interface.topBarTitle')}
        subtitle={t('app.interface.topBarDesc')}
        headerRight={
          isModified ? (
            <button
              onClick={onResetInterface}
              className="focus-ring rounded-sm flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
          checked={topBarLanguageSwitcher}
          onCheckedChange={onToggleTopBarLanguageSwitcher}
        />
        <TopBarPreview enabled={topBarLanguageSwitcher} />
      </SettingsCard>

      <CompanionSection />

      <SettingsCard
        icon={LayoutDashboard}
        title={t('app.interface.overviewTitle')}
        subtitle={t('app.interface.overviewDesc')}
      >
        <OverviewLayoutPreview highlightedKey={hoveredOverviewKey} />
        {overviewRows}
      </SettingsCard>

      <SettingsCard
        icon={PanelBottom}
        title={t('app.interface.playerTitle')}
        subtitle={t('app.interface.playerDesc')}
      >
        <PlayerBarPreview highlightedKey={hoveredPlayerKey} />
        {playerRows}
      </SettingsCard>
    </div>
  );
}
