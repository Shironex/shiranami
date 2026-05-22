import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import { useViewStore } from '@/stores/useViewStore';
import i18n from '@/lib/i18n';

const TOAST_ID = 'update-notification';

/**
 * Global hook that listens for auto-updater events and shows toast
 * notifications when a new version is available or ready to install.
 *
 * Must be mounted once at the app root level. No-op in non-Electron
 * environments and on macOS (which uses manual GitHub releases).
 */
export function useUpdateNotifications() {
  const notifiedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    const unsubs: (() => void)[] = [];

    unsubs.push(
      window.electronAPI.updater.onUpdateAvailable(info => {
        // Don't re-notify for the same version
        if (notifiedVersionRef.current === info.version) return;
        notifiedVersionRef.current = info.version;

        toast.info(i18n.t('updateAvailable', { ns: 'toast', version: info.version }), {
          id: TOAST_ID,
          duration: 19_000,
          action: {
            label: i18n.t('updateSettings', { ns: 'toast' }),
            onClick: () => useViewStore.getState().navigateTo('settings'),
          },
        });
      })
    );

    unsubs.push(
      window.electronAPI.updater.onUpdateDownloaded(info => {
        toast.success(i18n.t('updateReady', { ns: 'toast', version: info.version }), {
          id: TOAST_ID,
          duration: Infinity,
          action: {
            label: i18n.t('updateRestart', { ns: 'toast' }),
            onClick: () => {
              window.electronAPI.updater.installNow().catch(err => {
                logger.warn('Failed to install update', err);
              });
            },
          },
        });
      })
    );

    unsubs.push(
      window.electronAPI.updater.onUpdateError(message => {
        // RELEASE_PENDING is not a real error — ignore it
        if (message === 'RELEASE_PENDING') return;
      })
    );

    return () => unsubs.forEach(fn => fn());
  }, []);
}
