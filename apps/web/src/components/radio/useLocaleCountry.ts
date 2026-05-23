import { useEffect, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { localeCountryCode } from './radioUtils';

/**
 * Resolves the user's country as an ISO 3166-1 alpha-2 code for the radio
 * "Near you" shortcut. Tries the synchronous renderer locale first; when that
 * carries no region subtag (e.g. Chromium hands the renderer a bare "pl"), it
 * falls back to the OS region via the main process (`app.getLocaleCountryCode`),
 * which is independent of the UI language. Returns null when neither resolves.
 */
export function useLocaleCountry(): string | null {
  const [code, setCode] = useState<string | null>(() => localeCountryCode());

  useEffect(() => {
    if (code || !IS_ELECTRON) return;
    const request = window.electronAPI?.app?.getLocaleCountry?.();
    if (!request) return;
    let cancelled = false;
    request
      .then(value => {
        const normalized = (value ?? '').trim().toUpperCase();
        if (!cancelled && /^[A-Z]{2}$/.test(normalized)) setCode(normalized);
      })
      .catch(() => {
        /* OS country unavailable — "Near you" stays hidden, no-op. */
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return code;
}
