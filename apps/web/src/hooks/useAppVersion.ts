import { useEffect, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import appPackage from '../../package.json';

const FALLBACK_VERSION = appPackage.version;

export function useAppVersion() {
  const [version, setVersion] = useState(FALLBACK_VERSION);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    let isMounted = true;

    async function loadVersion() {
      try {
        const appVersion = await window.electronAPI.app.getVersion();
        if (isMounted) {
          setVersion(appVersion);
        }
      } catch (err) {
        console.error('Failed to load app version:', err);
      }
    }

    void loadVersion();

    return () => {
      isMounted = false;
    };
  }, []);

  return version;
}
