import { Info, MonitorCog } from 'lucide-react';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsInfoCallout,
} from '@/components/settings/SettingsCard';
import { useSystemSection } from './SystemSection.hooks';

export default function SystemSection() {
  const { t, toggles, showMacTrayNote } = useSystemSection();

  const toggleRows = toggles.map(toggle => (
    <SettingsToggleRow
      key={toggle.key}
      label={toggle.label}
      description={toggle.description}
      checked={toggle.checked}
      onCheckedChange={toggle.onCheckedChange}
      disabled={toggle.disabled}
      divider={toggle.divider}
    />
  ));

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={MonitorCog}
        title={t('sys.behaviorTitle')}
        subtitle={t('sys.behaviorDesc')}
      >
        {toggleRows}
      </SettingsCard>

      {showMacTrayNote && (
        <SettingsInfoCallout icon={Info}>{t('sys.macTrayNote')}</SettingsInfoCallout>
      )}
    </div>
  );
}
