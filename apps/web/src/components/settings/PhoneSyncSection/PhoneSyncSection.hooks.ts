import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SyncDevice, SyncStatus } from '@shiranami/contracts/bindings';
import type {
  IPhoneSyncDeviceRow,
  IPhoneSyncPairing,
  IPhoneSyncPendingRow,
  IPhoneSyncSectionView,
  PhoneSyncBusy,
} from './PhoneSyncSection.types';

const STOPPED: SyncStatus = {
  running: false,
  addresses: [],
  advertising: false,
  pairing: null,
  pendingPairs: [],
  transfers: [],
};

/** Pushed statuses re-read the device list at most this often. */
export const DEVICE_REFRESH_MS = 1000;

/** `window.electronAPI.sync`, absent outside the Tauri shell. */
function syncApi() {
  return typeof window === 'undefined' ? undefined : window.electronAPI?.sync;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** "4:05" from milliseconds. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Wall clock that ticks once a second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function usePhoneSyncSection(): IPhoneSyncSectionView {
  const { t, i18n } = useTranslation('settings');
  const api = syncApi();
  const [status, setStatus] = useState<SyncStatus>(STOPPED);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [busy, setBusy] = useState<PhoneSyncBusy>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!api) return;
    setDevices(await api.listDevices());
  }, [api]);

  // Initial read, then the pushed status. Pushes also re-read the device list
  // (a phone that revoked itself, `lastSeenAt`), but at most once per
  // DEVICE_REFRESH_MS: every audio transfer pushes on start and on end. Allow
  // and revoke from this section refresh the list right away themselves.
  useEffect(() => {
    if (!api) return undefined;
    let live = true;
    let timer: number | undefined;
    void Promise.all([api.getStatus(), api.listDevices()]).then(([initial, paired]) => {
      if (!live) return;
      setStatus(initial);
      setDevices(paired);
    });
    const unsubscribe = api.onStatus(next => {
      setStatus(next);
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void api.listDevices().then(paired => {
          if (live) setDevices(paired);
        });
      }, DEVICE_REFRESH_MS);
    });
    return () => {
      live = false;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [api]);

  const run = useCallback(async (key: PhoneSyncBusy, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(null);
    }
  }, []);

  const onToggle = (enabled: boolean) => {
    if (!api) return;
    void run('toggle', async () => setStatus(await api.setEnabled(enabled)));
  };

  const onStartPairing = () => {
    if (!api) return;
    // The ticket is also in the status (with the listener now running), so
    // one read keeps a single source for both.
    void run('pairing', async () => {
      await api.startPairing();
      setStatus(await api.getStatus());
    });
  };

  const onCancelPairing = () => {
    if (!api) return;
    void run('pairing', async () => setStatus(await api.cancelPairing()));
  };

  const onRespond = (requestId: string, allow: boolean) => {
    if (!api) return;
    void run(`respond:${requestId}`, async () => {
      await api.respondPairing(requestId, allow);
      setStatus(await api.getStatus());
      await refreshDevices();
    });
  };

  const onRevoke = (deviceId: string) => {
    if (!api) return;
    void run(`revoke:${deviceId}`, async () => setDevices(await api.revokeDevice(deviceId)));
  };

  const now = useNow(status.pairing !== null);
  const remaining = status.pairing ? status.pairing.expiresAt - now : 0;
  const pairing: IPhoneSyncPairing | null = status.pairing
    ? {
        deepLink: status.pairing.deepLink,
        expired: remaining <= 0,
        countdown:
          remaining <= 0
            ? t('phoneSync.codeExpired')
            : t('phoneSync.expiresIn', { time: formatCountdown(remaining) }),
      }
    : null;

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
  };

  const pendingRows: IPhoneSyncPendingRow[] = status.pendingPairs.map(pending => ({
    requestId: pending.requestId,
    label: `${pending.deviceName} · ${pending.platform}`,
    busy: busy === `respond:${pending.requestId}`,
  }));

  const deviceRows: IPhoneSyncDeviceRow[] = devices.map(device => {
    const parts = [
      device.platform,
      t('phoneSync.pairedOn', { date: formatDate(device.createdAt) }),
    ];
    if (device.lastSeenAt) {
      parts.push(t('phoneSync.lastSeen', { date: formatDate(device.lastSeenAt) }));
    }
    return {
      deviceId: device.deviceId,
      name: device.name,
      detail: parts.join(' · '),
      busy: busy === `revoke:${device.deviceId}`,
    };
  });

  const transferLines = status.transfers.map(transfer =>
    t('phoneSync.sending', { title: transfer.title, device: transfer.deviceName })
  );

  return {
    t,
    available: api !== undefined,
    running: status.running,
    busy,
    error,
    listeningLine: status.running
      ? t('phoneSync.listeningOn', { addresses: status.addresses.join(', ') })
      : null,
    advertising: status.advertising,
    pairing,
    pendingRows,
    transferLines,
    deviceRows,
    onToggle,
    onStartPairing,
    onCancelPairing,
    onRespond,
    onRevoke,
  };
}
