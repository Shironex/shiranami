import { useTranslation } from 'react-i18next';
import { Info, MonitorCog } from 'lucide-react';
import { IS_MAC, IS_ELECTRON } from '@/lib/platform';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsInfoCallout,
} from '@/components/settings/SettingsCard';
import {
  useSystemPrefsQuery,
  useUpdateSystemPrefMutation,
  type SystemPrefKey,
} from '@/hooks/queries/useSystemPrefs';

const TOGGLES: SystemPrefKey[] = ['launchAtStartup', 'minimizeToTray', 'closeToTray'];

export function SystemSection() {
  const { t } = useTranslation('settings');
  const { data: prefs } = useSystemPrefsQuery();
  const updatePref = useUpdateSystemPrefMutation();

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={MonitorCog}
        title={t('sys.behaviorTitle')}
        subtitle={t('sys.behaviorDesc')}
      >
        {TOGGLES.map((key, index) => (
          <SettingsToggleRow
            key={key}
            label={t(`sys.${key}`)}
            description={t(`sys.${key}Desc`)}
            checked={prefs?.[key] ?? false}
            onCheckedChange={value => updatePref.mutate({ key, value })}
            disabled={!IS_ELECTRON || !prefs}
            divider={index > 0}
          />
        ))}
      </SettingsCard>

      {IS_MAC && <SettingsInfoCallout icon={Info}>{t('sys.macTrayNote')}</SettingsInfoCallout>}
    </div>
  );
}
