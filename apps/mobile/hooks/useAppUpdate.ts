import { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';

export type AppUpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'upToDate' | 'error';

/**
 * Over the air updates (EAS Update) only run in preview and production builds.
 * A dev build loads its JavaScript from Metro and `checkForUpdateAsync` throws.
 */
export function appUpdatesEnabled(): boolean {
  return Updates.isEnabled && !__DEV__;
}

const SHORT_ID_LENGTH = 8;

/** What is running: channel plus a short update id, or the bundle in the build. */
export function describeRunningUpdate(): string {
  if (!appUpdatesEnabled()) return 'Development build';
  const source =
    Updates.updateId && !Updates.isEmbeddedLaunch
      ? Updates.updateId.slice(0, SHORT_ID_LENGTH)
      : 'built in';
  return Updates.channel ? `${Updates.channel} · ${source}` : source;
}

/**
 * Manual "check for updates". The launch check (app.json `updates`) may have
 * downloaded an update already; then it is ready from the start and only
 * needs a restart.
 */
export function useAppUpdate() {
  const { isUpdatePending } = Updates.useUpdates();
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const current: AppUpdateStatus = isUpdatePending && status === 'idle' ? 'ready' : status;

  const check = useCallback(async () => {
    setStatus('checking');
    try {
      const result = await Updates.checkForUpdateAsync();
      // A rollback directive reports isAvailable false but still has to be
      // fetched and applied, or the app keeps running the rolled-back update.
      if (!result.isAvailable && !result.isRollBackToEmbedded) {
        setStatus('upToDate');
        return;
      }
      setStatus('downloading');
      const fetched = await Updates.fetchUpdateAsync();
      setStatus(fetched.isNew || fetched.isRollBackToEmbedded ? 'ready' : 'upToDate');
    } catch {
      setStatus('error');
    }
  }, []);

  const restart = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      setStatus('error');
    }
  }, []);

  return { status: current, check, restart };
}
