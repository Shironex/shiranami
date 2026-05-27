import { useEffect, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { localeCountryCode } from './radioUtils';

/**
 * Resolves the user's country as an ISO 3166-1 alpha-2 code for the radio
 * "Near you" shortcut. In Electron the OS region (`app.getLocaleCountry`)
 * wins: it reflects the system Region setting and is independent of the UI
 * language, so someone in Europe running the app in English still resolves to
 * their actual country instead of "US". The renderer locale
 * (`localeCountryCode`, derived from the UI language) is only the fallback,
 * used directly on the web build and when the OS region is unavailable.
 * Returns null when neither resolves, which keeps the "Near you" button hidden.
 */
export function useLocaleCountry(): string | null {
  // Seed synchronously whenever there is no OS-region bridge to consult (web,
  // or any environment without the Electron preload such as tests): the
  // renderer locale is all we have, so use it directly and skip the needless
  // null -> value re-render on mount. In Electron with the bridge present we
  // start empty and let the effect below fill in the OS region.
  const [code, setCode] = useState<string | null>(() => {
    if (!IS_ELECTRON || !window.electronAPI?.app?.getLocaleCountry) {
      return localeCountryCode();
    }
    return null;
  });

  useEffect(() => {
    const request = window.electronAPI?.app?.getLocaleCountry?.();
    if (!request) return;
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
