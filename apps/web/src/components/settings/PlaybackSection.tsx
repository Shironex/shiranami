import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { StatusBadge } from '@/components/ui/status-badge';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import {
  useSettingsQuery,
  useUpdateSettingsMutation,
} from '@/hooks/queries/useSettings';

export function PlaybackSection() {
  const { t } = useTranslation('settings');
  const { data: settings } = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();

  const rememberPlaybackPosition = settings?.rememberPlaybackPosition ?? false;
  const discordRpc = settings?.discordRpc ?? false;

  const crossfadeEnabled = usePlayerStore((s) => s.crossfadeEnabled);
  const crossfadeDuration = usePlayerStore((s) => s.crossfadeDuration);
  const setCrossfadeEnabled = usePlayerStore((s) => s.setCrossfadeEnabled);
  const setCrossfadeDuration = usePlayerStore((s) => s.setCrossfadeDuration);

  const updateSetting = (key: 'rememberPlaybackPosition' | 'discordRpc', value: boolean) => {
    updateSettings.mutate({ [key]: value });
  };

  return (
    <SettingsCard
      icon={Settings2}
      title={t('play.title')}
      subtitle={t('play.subtitle')}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t('play.rememberPosition')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('play.rememberDesc')}
            </p>
          </div>
          <Switch
            checked={rememberPlaybackPosition}
            onChange={(v) => updateSetting('rememberPlaybackPosition', v)}
          />
        </div>

        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              {t('play.crossfade')}
              <StatusBadge variant="beta">{t('play.beta')}</StatusBadge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('play.crossfadeDesc')}
            </p>
          </div>
          <Switch
            checked={crossfadeEnabled}
            onChange={setCrossfadeEnabled}
          />
        </div>

        {crossfadeEnabled && (
          <div className="px-3 py-3 rounded-xl">
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
          <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('play.discordRpc')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('play.discordDesc')}
              </p>
            </div>
            <Switch
              checked={discordRpc}
              onChange={(v) => updateSetting('discordRpc', v)}
            />
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
