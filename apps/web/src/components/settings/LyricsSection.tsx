import { useTranslation } from 'react-i18next';
import { Mic2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { IS_ELECTRON } from '@/lib/platform';
import { useState, useEffect, useCallback } from 'react';

interface LyricsSettings {
  preferSyncedOverLocalPlain: boolean;
}

const DEFAULT_LYRICS_SETTINGS: LyricsSettings = {
  preferSyncedOverLocalPlain: true,
};

export function LyricsSection() {
  const { t } = useTranslation('settings');
  const [lyricsSettings, setLyricsSettings] = useState<LyricsSettings>(DEFAULT_LYRICS_SETTINGS);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    async function load() {
      try {
        const saved = await window.electronAPI.store.get<LyricsSettings & Record<string, unknown>>('settings');
        if (saved) {
          setLyricsSettings({
            preferSyncedOverLocalPlain: saved.preferSyncedOverLocalPlain ?? true,
          });
        }
      } catch (err) {
        console.error('Failed to load lyrics settings:', err);
      }
    }

    load();
  }, []);

  const updateLyricsSetting = useCallback(
    async (key: keyof LyricsSettings, value: boolean) => {
      const updated = { ...lyricsSettings, [key]: value };
      setLyricsSettings(updated);
      if (IS_ELECTRON) {
        try {
          const existing =
            (await window.electronAPI.store.get<Record<string, unknown>>('settings')) ?? {};
          await window.electronAPI.store.set('settings', { ...existing, ...updated });
        } catch (err) {
          console.error('Failed to save lyrics settings:', err);
        }
      }
    },
    [lyricsSettings],
  );

  return (
    <SettingsCard
      icon={Mic2}
      title={t('lyrics.title')}
      subtitle={t('lyrics.subtitle')}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div className="pr-4">
            <p className="text-sm font-medium text-foreground">
              {t('lyrics.preferSyncedOverLocalPlain.label')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('lyrics.preferSyncedOverLocalPlain.description')}
            </p>
          </div>
          <Switch
            checked={lyricsSettings.preferSyncedOverLocalPlain}
            onChange={(v) => updateLyricsSetting('preferSyncedOverLocalPlain', v)}
          />
        </div>
      </div>
    </SettingsCard>
  );
}
