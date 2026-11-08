import type { AudioLibraryModule, AudioPermission } from '@/modules/audio-library';

/**
 * Where the audio permission stands, for the scan flow:
 * - `undetermined`: never asked; the scan asks.
 * - `denied`: refused, but Android will ask again.
 * - `blocked`: refused for good; only the system settings can change it.
 * - `unavailable`: this build has no native module (web, Expo Go).
 *
 * Android has no partial grant for audio ("Allow limited" covers photos and
 * videos only), so any grant is the whole music collection.
 */
export type PermissionState = 'granted' | 'undetermined' | 'denied' | 'blocked' | 'unavailable';

export function permissionState(permission: AudioPermission | null): PermissionState {
  if (!permission) return 'unavailable';
  if (permission.granted || permission.status === 'granted') return 'granted';
  if (permission.status === 'undetermined') return 'undetermined';
  return permission.canAskAgain ? 'denied' : 'blocked';
}

/** Asks only when asking can still show the system dialog. */
export async function ensureAudioPermission(
  native: AudioLibraryModule | null
): Promise<PermissionState> {
  if (!native) return 'unavailable';
  const current = permissionState(await native.getPermissionAsync());
  if (current === 'granted' || current === 'blocked') return current;
  return permissionState(await native.requestPermissionAsync());
}

/** The one line shown under the scan button when scanning cannot go ahead. */
export function permissionNote(state: PermissionState | null): string | null {
  switch (state) {
    case 'denied':
      return 'Music access was not allowed. You can still import files.';
    case 'blocked':
      return 'Music access is off. Allow it in system settings, or import files.';
    case 'unavailable':
      return 'Scanning needs the Android app.';
    default:
      return null;
  }
}
