import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/queries/useSettings';

export function PlaybackSection() {
  const { t } = useTranslation('settings');
  const { data: settings } = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();

  const rememberPlaybackPosition = settings?.rememberPlaybackPosition ?? false;
  const discordRpc = settings?.discordRpc ?? false;

  const crossfadeEnabled = usePlaybackStore(s => s.crossfadeEnabled);
  const crossfadeDuration = usePlaybackStore(s => s.crossfadeDuration);
  const setCrossfadeEnabled = usePlaybackStore(s => s.setCrossfadeEnabled);
  const setCrossfadeDuration = usePlaybackStore(s => s.setCrossfadeDuration);

  const updateSetting = (key: 'rememberPlaybackPosition' | 'discordRpc', value: boolean) => {
    updateSettings.mutate({ [key]: value });
  };

  return (
    <SettingsCard icon={Settings2} title={t('play.title')} subtitle={t('play.subtitle')}>
      <div>
        <SettingsToggleRow
          label={t('play.rememberPosition')}
          description={t('play.rememberDesc')}
          checked={rememberPlaybackPosition}
          onCheckedChange={v => updateSetting('rememberPlaybackPosition', v)}
        />

        <SettingsToggleRow
          divider
          label={t('play.crossfade')}
          description={t('play.crossfadeDesc')}
          checked={crossfadeEnabled}
          onCheckedChange={setCrossfadeEnabled}
        />

        {crossfadeEnabled && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{t('play.duration')}</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {crossfadeDuration}s
              </span>
            </div>
            <Slider
              min={1}
              max={12}
              step={1}
              value={[crossfadeDuration]}
              onValueChange={([v]) => setCrossfadeDuration(v)}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/60">1s</span>
              <span className="text-[10px] text-muted-foreground/60">12s</span>
            </div>
          </div>
        )}

        {IS_ELECTRON && (
          <SettingsToggleRow
            divider
            label={t('play.discordRpc')}
            description={t('play.discordDesc')}
            checked={discordRpc}
            onCheckedChange={v => updateSetting('discordRpc', v)}
          />
        )}
      </div>
    </SettingsCard>
  );
}
