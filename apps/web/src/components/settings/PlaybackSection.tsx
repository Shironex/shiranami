import { useState, useEffect, useCallback } from 'react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { Settings2 } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';

interface SettingsData {
  rememberPlaybackPosition: boolean;
  gaplessPlayback: boolean;
}

const DEFAULT_SETTINGS: SettingsData = {
  rememberPlaybackPosition: false,
  gaplessPlayback: false,
};

export function PlaybackSection() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    async function load() {
      try {
        const savedSettings =
          await window.electronAPI.store.get<SettingsData>('settings');
        if (savedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        }
      } catch (err) {
        console.error('Failed to load playback settings:', err);
      }
    }

    load();
  }, []);

  const updateSetting = useCallback(
    async (key: keyof SettingsData, value: boolean) => {
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      if (IS_ELECTRON) {
        try {
          await window.electronAPI.store.set('settings', updated);
        } catch (err) {
          console.error('Failed to save settings:', err);
        }
      }
    },
    [settings]
  );

  return (
    <SettingsCard
      icon={Settings2}
      title="Playback"
      subtitle="Audio playback preferences"
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground">
              Remember playback position
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Resume tracks from where you left off
            </p>
          </div>
          <Switch
            checked={settings.rememberPlaybackPosition}
            onChange={(v) => updateSetting('rememberPlaybackPosition', v)}
          />
        </div>

        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground">
              Gapless playback
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seamless transitions between tracks
            </p>
          </div>
          <Switch
            checked={settings.gaplessPlayback}
            onChange={(v) => updateSetting('gaplessPlayback', v)}
          />
        </div>
      </div>
    </SettingsCard>
  );
}
