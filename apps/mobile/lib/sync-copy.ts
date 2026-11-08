import type { SyncErrorCode } from '@/lib/sync-client';

/** What the phone says about desktop sync. Plain English, no protocol words. */

export interface Notice {
  title: string;
  body: string;
}

/** Why pairing stopped, for the pairing screen. */
export function pairingNotice(code: SyncErrorCode, desktopName: string): Notice {
  switch (code) {
    case 'denied':
      return {
        title: 'Pairing was declined',
        body: `Someone pressed Deny on ${desktopName}. Scan the code again if that was a mistake.`,
      };
    case 'timeout':
      return {
        title: 'Nobody answered on the desktop',
        body: `${desktopName} did not get an Allow within two minutes. Scan again and press Allow there.`,
      };
    case 'expired':
    case 'bad_code':
      return {
        title: 'This code has expired',
        body: 'Pairing codes work once and only for a few minutes. Choose Pair a phone on the desktop again and scan the new code.',
      };
    case 'busy':
      return {
        title: 'The desktop is busy',
        body: `${desktopName} is already pairing another phone. Finish or cancel that first, then scan again.`,
      };
    case 'rate_limited':
      return {
        title: 'Too many tries',
        body: 'Wait a minute, then scan the code again.',
      };
    case 'unreachable':
      return {
        title: `Can't reach ${desktopName}`,
        body: 'Make sure both are on the same Wi-Fi (not a guest network), that Shiranami is open on the desktop and Sync with phone is on.',
      };
    case 'not_private':
      return {
        title: 'This code points outside your home network',
        body: 'Sync only talks to computers on your own Wi-Fi. Connect the desktop to the same network and show a new code.',
      };
    case 'unverified':
      return {
        title: "Couldn't confirm the desktop",
        body: 'The answer did not come from the desktop that showed the code, so pairing stopped. Try again on a network you trust.',
      };
    case 'protocol':
      return {
        title: 'Update Shiranami',
        body: 'The desktop and this phone speak different versions of sync. Update both apps and try again.',
      };
    case 'storage':
      return {
        title: "Couldn't save the pairing",
        body: 'The phone could not store the pairing key. Try again.',
      };
    default:
      return {
        title: 'Pairing failed',
        body: 'Something went wrong on the way. Scan the code again.',
      };
  }
}

/** One line for Settings and the desktop screen when a sync stops. */
export function syncErrorLine(code: SyncErrorCode, desktopName: string): string {
  switch (code) {
    case 'unreachable':
      return `Can't reach ${desktopName}. Check the Wi-Fi and that Sync with phone is on there.`;
    case 'unpaired':
      return `${desktopName} no longer knows this phone. Forget it and pair again.`;
    case 'rate_limited':
    case 'too_many_streams':
      return 'The desktop asked to slow down. Try again in a minute.';
    case 'protocol':
      return 'Update Shiranami on the desktop and this phone.';
    case 'cancelled':
      return 'Stopped. Sync now picks up where it left off.';
    default:
      return 'Sync stopped early. Try again.';
  }
}

/** "just now", "2 min ago", "3 h ago", "4 days ago". */
export function timeAgo(iso: string | null, now: number): string | null {
  const then = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** "Up to date · 2 min ago", or "Not synced yet". */
export function lastSyncLine(iso: string | null, now: number): string {
  const ago = timeAgo(iso, now);
  return ago ? `Up to date · ${ago}` : 'Not synced yet';
}

/** 3.2 GB, 640 MB, 12 KB. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(0, Math.round(bytes / 1e3))} KB`;
}

/** The fixed line that says sync is one way in v0. */
export const ONE_WAY_NOTE =
  'One way for now: songs, playlists and favorites come from the desktop to the phone. Changes on the phone stay on the phone.';
