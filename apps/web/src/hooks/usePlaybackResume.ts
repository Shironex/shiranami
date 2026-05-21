import { useCallback, useEffect, useRef, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';

interface SettingsData {
  rememberPlaybackPosition?: boolean;
}

interface PersistedPlayerState {
  currentTrackPath: string;
  queuePaths: string[];
  queueIndex: number;
  currentTime: number;
  isPlaying: boolean;
}

const PLAYER_STATE_KEY = 'player-state';

function buildPersistedState(): PersistedPlayerState | null {
  const { currentTrack, queue, queueIndex, currentTime, isPlaying } = usePlaybackStore.getState();

  if (!currentTrack) {
    return null;
  }

  return {
    currentTrackPath: currentTrack.filePath,
    queuePaths: queue.map(track => track.filePath),
    queueIndex,
    currentTime: isFinite(currentTime) && currentTime >= 0 ? currentTime : 0,
    isPlaying,
  };
}

function restoreQueueFromPaths(library: Track[], persisted: PersistedPlayerState): Track[] {
  const byPath = new Map(library.map(track => [track.filePath, track]));
  const restoredQueue = persisted.queuePaths
    .map(filePath => byPath.get(filePath))
    .filter((track): track is Track => Boolean(track));

  if (restoredQueue.length > 0) {
    return restoredQueue;
  }

  const currentTrack = byPath.get(persisted.currentTrackPath);
  return currentTrack ? [currentTrack] : [];
}

export function usePlaybackResume(enabled = true) {
  const library = useLibraryStore(s => s.library);
  const currentTrackPath = usePlaybackStore(s => s.currentTrack?.filePath ?? null);
  const queue = usePlaybackStore(s => s.queue);
  const queueIndex = usePlaybackStore(s => s.queueIndex);
  const isPlaying = usePlaybackStore(s => s.isPlaying);

  const [isReady, setIsReady] = useState(!IS_ELECTRON);
  const [isRestoreResolved, setIsRestoreResolved] = useState(!IS_ELECTRON);
  const [shouldRestore, setShouldRestore] = useState(false);
  const [persistedState, setPersistedState] = useState<PersistedPlayerState | null>(null);
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    let cancelled = false;

    async function loadSetting() {
      try {
        const [settings, savedState] = await Promise.all([
          window.electronAPI.store.get<SettingsData>('settings'),
          window.electronAPI.store.get<PersistedPlayerState>(PLAYER_STATE_KEY),
        ]);

        if (!cancelled) {
          const rememberPlaybackPosition = Boolean(settings?.rememberPlaybackPosition);
          setShouldRestore(rememberPlaybackPosition);
          setPersistedState(savedState ?? null);
          if (!rememberPlaybackPosition || !savedState?.currentTrackPath) {
            setIsRestoreResolved(true);
          }
        }
      } catch {
        // Keep playback resume disabled if settings can't be read.
        if (!cancelled) {
          setIsRestoreResolved(true);
        }
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    }

    loadSetting();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !IS_ELECTRON ||
      !enabled ||
      !isReady ||
      isRestoreResolved ||
      !shouldRestore ||
      !persistedState?.currentTrackPath ||
      hasRestoredRef.current ||
      library.length === 0
    ) {
      return;
    }

    let cancelled = false;

    async function restorePlayerState() {
      const state = persistedState;

      try {
        if (cancelled || !state) {
          return;
        }

        const restoredQueue = restoreQueueFromPaths(library, state);
        const restoredIndex = restoredQueue.findIndex(
          track => track.filePath === state.currentTrackPath
        );

        if (restoredIndex < 0) {
          return;
        }

        const restoredTime =
          isFinite(state.currentTime) && state.currentTime > 0 ? state.currentTime : 0;

        usePlaybackStore.setState({
          queue: restoredQueue,
          queueIndex: restoredIndex,
          currentTrack: restoredQueue[restoredIndex],
          currentTime: restoredTime,
          _seekTarget: restoredTime,
          isPlaying: Boolean(state.isPlaying),
          error: null,
        });
      } catch {
        // Ignore restore failures and fall back to the default empty player state.
      } finally {
        if (!cancelled) {
          hasRestoredRef.current = true;
          setIsRestoreResolved(true);
        }
      }
    }

    restorePlayerState();

    return () => {
      cancelled = true;
    };
  }, [enabled, isReady, isRestoreResolved, library, persistedState, shouldRestore]);

  // Last snapshot actually written to the store, serialized. `undefined` means
  // "never persisted this session" so the first write always goes through; an
  // empty string means "last action was a delete (no track)". Used to skip
  // redundant 1Hz writes when the player is paused and nothing has changed.
  const lastPersistedRef = useRef<string | undefined>(undefined);

  // Single persist path shared by the 1Hz interval and the change-driven effect.
  // Persists when playing (currentTime is advancing, so resume stays fresh),
  // when forced (change events / unload / teardown), or when the snapshot
  // differs from the last write. Skips the steady stream of identical writes
  // while paused/hidden.
  const persistState = useCallback((force = false) => {
    const state = buildPersistedState();

    if (!state) {
      if (force || lastPersistedRef.current !== '') {
        lastPersistedRef.current = '';
        window.electronAPI.store.delete(PLAYER_STATE_KEY).catch(() => {});
      }
      return;
    }

    const serialized = JSON.stringify(state);
    if (!force && !state.isPlaying && serialized === lastPersistedRef.current) {
      return;
    }

    lastPersistedRef.current = serialized;
    window.electronAPI.store.set(PLAYER_STATE_KEY, state).catch(() => {});
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON || !enabled || !isReady || !isRestoreResolved) return;

    const intervalId = window.setInterval(() => persistState(), 1000);
    // Always flush on unload and on teardown so the final position is never lost.
    const flush = () => persistState(true);
    window.addEventListener('beforeunload', flush);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [enabled, isReady, isRestoreResolved, persistState]);

  useEffect(() => {
    if (!IS_ELECTRON || !enabled || !isReady || !isRestoreResolved) return;
    // Track/queue/index/play-state changes are always meaningful — force a write
    // (and refresh the dedupe snapshot so the next interval tick can skip).
    persistState(true);
  }, [
    enabled,
    isReady,
    isRestoreResolved,
    currentTrackPath,
    queue,
    queueIndex,
    isPlaying,
    persistState,
  ]);
}
