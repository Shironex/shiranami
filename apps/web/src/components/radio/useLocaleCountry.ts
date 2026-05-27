import { useEffect, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { localeCountryCode } from './radioUtils';

/**
 * Resolves the user's country as an ISO 3166-1 alpha-2 code for the radio
 * "Near you" shortcut. In Electron the OS region (`app.getLocaleCountryCode`)
 * wins: it reflects the system Region setting and is independent of the UI
 * language, so someone in Europe running the app in English still resolves to
 * their actual country instead of "US". The renderer locale
 * (`localeCountryCode`, derived from the UI language) is only the fallback,
 * used directly on the web build and when the OS region is unavailable.
 * Returns null when neither resolves, which keeps the "Near you" button hidden.
 */
export function useLocaleCountry(): string | null {
  // On the web there is no OS-region bridge, so the renderer locale is all we
  // have and resolves synchronously. In Electron we start empty and let the
  // async OS-region lookup below fill it, falling back to the locale on miss.
  const [code, setCode] = useState<string | null>(() => (IS_ELECTRON ? null : localeCountryCode()));

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const request = window.electronAPI?.app?.getLocaleCountry?.();
    if (!request) {
      // No IPC bridge exposed — fall back to the UI-locale region.
      setCode(localeCountryCode());
      return;
    }
    let cancelled = false;
    request
      .then(value => {
        if (cancelled) return;
        const normalized = (value ?? '').trim().toUpperCase();
        // Prefer the OS region; fall back to the UI-locale region only when the
        // OS could not hand us a valid ISO 3166-1 alpha-2 code.
        setCode(/^[A-Z]{2}$/.test(normalized) ? normalized : localeCountryCode());
      })
      .catch(() => {
        if (!cancelled) setCode(localeCountryCode());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return code;
}
