import { useEffect, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

/**
 * Hydrates and persists player-only preferences that should survive app restarts.
 * Kept separate from library loading so volume/mute state is not coupled to DB startup.
 */
export function usePlayerPreferences() {
  const volume = usePlaybackStore((s) => s.volume);
  const isMuted = usePlaybackStore((s) => s.isMuted);
  const [isHydrated, setIsHydrated] = useState(!IS_ELECTRON);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    let cancelled = false;

    async function hydratePreferences() {
      try {
        const [storedVolume, storedMuted] = await Promise.all([
          window.electronAPI.store.get<number>('player.volume'),
          window.electronAPI.store.get<boolean>('player.isMuted'),
        ]);

        const updates: Partial<Pick<ReturnType<typeof usePlaybackStore.getState>, 'volume' | 'isMuted'>> =
          {};

        if (typeof storedVolume === 'number' && isFinite(storedVolume)) {
          updates.volume = Math.max(0, Math.min(1, storedVolume));
        }
        if (typeof storedMuted === 'boolean') {
          updates.isMuted = storedMuted;
        }

        if (!cancelled && Object.keys(updates).length > 0) {
          usePlaybackStore.setState(updates);
        }
      } catch {
        // Ignore store read failures and keep in-memory defaults.
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    }

    hydratePreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON || !isHydrated) return;
    window.electronAPI.store.set('player.volume', volume).catch(() => {});
  }, [isHydrated, volume]);

  useEffect(() => {
    if (!IS_ELECTRON || !isHydrated) return;
    window.electronAPI.store.set('player.isMuted', isMuted).catch(() => {});
  }, [isHydrated, isMuted]);
}
