import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useState, useEffect, useCallback } from 'react';

interface ElectronSettings {
  rememberPlaybackPosition: boolean;
  discordRpc: boolean;
}

const DEFAULT_ELECTRON_SETTINGS: ElectronSettings = {
  rememberPlaybackPosition: false,
  discordRpc: false,
};

export function PlaybackSection() {
  const { t } = useTranslation('settings');
  const [electronSettings, setElectronSettings] = useState<ElectronSettings>(DEFAULT_ELECTRON_SETTINGS);

  const crossfadeEnabled = usePlayerStore((s) => s.crossfadeEnabled);
  const crossfadeDuration = usePlayerStore((s) => s.crossfadeDuration);
  const setCrossfadeEnabled = usePlayerStore((s) => s.setCrossfadeEnabled);
  const setCrossfadeDuration = usePlayerStore((s) => s.setCrossfadeDuration);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    async function load() {
      try {
        const saved = await window.electronAPI.store.get<ElectronSettings & Record<string, unknown>>('settings');
        if (saved) {
          setElectronSettings({
            rememberPlaybackPosition: saved.rememberPlaybackPosition ?? false,
            discordRpc: saved.discordRpc ?? false,
          });
        }
      } catch (err) {
        console.error('Failed to load playback settings:', err);
      }
    }

    load();
  }, []);

  const updateElectronSetting = useCallback(
    async (key: keyof ElectronSettings, value: boolean) => {
      const updated = { ...electronSettings, [key]: value };
      setElectronSettings(updated);
      if (IS_ELECTRON) {
        try {
          await window.electronAPI.store.set('settings', updated);
        } catch (err) {
          console.error('Failed to save settings:', err);
        }
      }
    },
    [electronSettings],
  );

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
            checked={electronSettings.rememberPlaybackPosition}
            onChange={(v) => updateElectronSetting('rememberPlaybackPosition', v)}
          />
        </div>

        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              {t('play.crossfade')}
              <span className="px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider">
                {t('play.beta')}
              </span>
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
              checked={electronSettings.discordRpc}
              onChange={(v) => updateElectronSetting('discordRpc', v)}
            />
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
