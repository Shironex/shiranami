import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** What is in flight, so the matching control can spin and disable. */
export type PhoneSyncBusy = 'toggle' | 'pairing' | `respond:${string}` | `revoke:${string}` | null;

/** A phone waiting for Allow / Deny, ready to render. */
export interface IPhoneSyncPendingRow {
  readonly requestId: string;
  /** "Pixel 9 · android". */
  readonly label: string;
  readonly busy: boolean;
}

/** A paired phone, ready to render. */
export interface IPhoneSyncDeviceRow {
  readonly deviceId: string;
  readonly name: string;
  /** "android · paired 8 Nov 2026 · last seen 8 Nov 2026". */
  readonly detail: string;
  readonly busy: boolean;
}

/** The open pairing window. */
export interface IPhoneSyncPairing {
  /** The QR payload. Carries the one-time secret; rendered only as a code. */
  readonly deepLink: string;
  /** "Expires in 4:59", or the expired notice. */
  readonly countdown: string;
  readonly expired: boolean;
}

export interface IPhoneSyncSectionView {
  readonly t: TranslateFn;
  /** False outside the desktop app (browser dev, the v1 preload). */
  readonly available: boolean;
  /** Listener up. */
  readonly running: boolean;
  readonly busy: PhoneSyncBusy;
  /** The last start / pairing failure, shown inline. */
  readonly error: string | null;
  /** "Listening on 192.168.1.20:53111", or null while off. */
  readonly listeningLine: string | null;
  /** Whether `_shiranami._tcp` is advertised, for the discovery hint. */
  readonly advertising: boolean;
  readonly pairing: IPhoneSyncPairing | null;
  readonly pendingRows: readonly IPhoneSyncPendingRow[];
  /** "Sending <title> to <phone>" per active stream. */
  readonly transferLines: readonly string[];
  readonly deviceRows: readonly IPhoneSyncDeviceRow[];
  readonly onToggle: (enabled: boolean) => void;
  readonly onStartPairing: () => void;
  readonly onCancelPairing: () => void;
  readonly onRespond: (requestId: string, allow: boolean) => void;
  readonly onRevoke: (deviceId: string) => void;
}
