import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { env } from '@/lib/env';
import type { CardMode } from '@/lib/player-stage';

export type PlaceholderArt = 'kanji' | 'photo';

/**
 * The player card's open or folded state. `auto` until the user picks: open
 * when the song has lyrics, folded (big cover) when it has none.
 */
export type PlayerCardMode = CardMode;

export interface AppSettings {
  showLabels: boolean;
  serverUrl: string;
  /** What tracks and stations without artwork show. */
  placeholderArt: PlaceholderArt;
  playerCard: PlayerCardMode;
}

const DEFAULTS: AppSettings = {
  showLabels: true,
  serverUrl: env.apiUrl,
  placeholderArt: 'kanji',
  playerCard: 'auto',
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
        playerCard:
          raw.playerCard === 'open' || raw.playerCard === 'folded' ? raw.playerCard : 'auto',
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
