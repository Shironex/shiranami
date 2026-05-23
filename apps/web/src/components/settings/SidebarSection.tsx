import { useTranslation } from 'react-i18next';
import { PanelLeft } from 'lucide-react';
import {
  SettingsCard,
  SettingsSelectRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { SidebarPreview } from '@/components/settings/SidebarPreview';
import { SETTINGS_SIDEBAR_ITEMS } from '@/components/settings/SettingsSidebarConfig';
import { useUIStore, type LandingView } from '@/stores/useUIStore';

export function SidebarSection() {
  const { t } = useTranslation('settings');
  const { t: ts } = useTranslation('sidebar');
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const toggleSidebarItem = useUIStore(s => s.toggleSidebarItem);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);
  const setSidebarPlaylistsVisible = useUIStore(s => s.setSidebarPlaylistsVisible);
  const landingView = useUIStore(s => s.landingView);
  const setLandingView = useUIStore(s => s.setLandingView);

  return (
    <SettingsCard icon={PanelLeft} title={t('app.sidebarTitle')} subtitle={t('app.sidebarDesc')}>
      <SidebarPreview />

      <div className="border-t border-border/30 pt-1">
        <SettingsSelectRow
          label={t('app.landingViewLabel')}
          description={t('app.landingViewDesc')}
          value={landingView}
          onValueChange={value => setLandingView(value as LandingView)}
          options={[
            { value: 'overview', label: ts('overview') },
            { value: 'library', label: ts('library') },
          ]}
        />
        {SETTINGS_SIDEBAR_ITEMS.map(item => (
          <SettingsToggleRow
            key={item.id}
            label={ts(item.key)}
            checked={!sidebarHiddenItems.includes(item.id)}
            onCheckedChange={() => toggleSidebarItem(item.id)}
            divider
          />
        ))}
        <SettingsToggleRow
          label={t('app.sidebarPlaylists')}
          description={t('app.sidebarPlaylistsDesc')}
          checked={sidebarPlaylistsVisible}
          onCheckedChange={setSidebarPlaylistsVisible}
          divider
        />
      </div>
    </SettingsCard>
  );
}
