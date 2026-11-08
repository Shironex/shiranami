import { createContext, useContext, useEffect } from 'react';
import { useSettings, type AppSettings } from '@/hooks/useSettings';
import { applyServerUrl } from '@/lib/api';

interface SettingsContextValue {
  settings: AppSettings;
  loaded: boolean;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const value = useSettings();
  const { loaded, settings } = value;

  // The API client starts on the build-time default; the saved server URL
  // replaces it once settings load and again whenever the user edits it. A
  // half-typed or malformed URL is skipped, so the last valid one stays.
  useEffect(() => {
    if (loaded) applyServerUrl(settings.serverUrl);
  }, [loaded, settings.serverUrl]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettingsContext must be used within SettingsProvider');
  }
  return ctx;
}
