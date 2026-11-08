import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { env } from '@/lib/env';

export type PlaceholderArt = 'kanji' | 'photo';

export interface AppSettings {
  showLabels: boolean;
  serverUrl: string;
  /** What tracks and stations without artwork show. */
  placeholderArt: PlaceholderArt;
}

const DEFAULTS: AppSettings = {
  showLabels: true,
  serverUrl: env.apiUrl,
  placeholderArt: 'kanji',
};

export function useSettings() {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings').then(rows => {
      const raw = Object.fromEntries(rows.map(r => [r.key, r.value]));
      setSettings({
        showLabels: raw.showLabels !== 'false',
        serverUrl: raw.serverUrl || DEFAULTS.serverUrl,
        placeholderArt: raw.placeholderArt === 'photo' ? 'photo' : 'kanji',
      });
      setLoaded(true);
    });
  }, [db]);

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings(prev => ({ ...prev, [key]: value }));
      db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        key,
        String(value),
      ]);
    },
    [db]
  );

  return { settings, loaded, update };
}
