import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const res = await fetch('https://clients3.google.com/generate_204', {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (mounted) setIsOnline(res.ok);
      } catch {
        if (mounted) setIsOnline(false);
      }
    };

    check();

    // Re-check when app comes to foreground
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });

    // Periodic check every 30s
    const interval = setInterval(check, 30000);

    return () => {
      mounted = false;
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
