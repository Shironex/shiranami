import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import { logger } from '@/lib/logger';
import i18n from '@/lib/i18n';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';

interface SettingsData {
  rememberPlaybackPosition?: boolean;
}

/**
 * Schema for the persisted player-state blob. The store value is `unknown` on
 * the main side (renderer-owned), so a stale/corrupt/foreign-shape blob would
 * otherwise be trusted blindly. `safeParse` lets us reset-on-mismatch instead.
 */
const persistedPlayerStateSchema = z.object({
  currentTrackPath: z.string().min(1),
  queuePaths: z.array(z.string()),
  queueIndex: z.number().int(),
  // Accept any numeric value (including NaN/Infinity from older blobs); the
  // restore path clamps non-finite values to 0 rather than discarding the blob.
  // `z.number()` rejects NaN/Infinity in zod v4, so gate on `typeof` instead.
  currentTime: z.custom<number>(val => typeof val === 'number'),
  isPlaying: z.boolean(),
});

type PersistedPlayerState = z.infer<typeof persistedPlayerStateSchema>;

/**
 * Validate a raw persisted blob. Returns the typed state on success, or `null`
 * when the shape doesn't match (so the caller resets the key). Pure and
 * exported so the validation/reset behavior is unit-testable without the hook.
 */
export function parsePersistedPlayerState(raw: unknown): PersistedPlayerState | null {
  const result = persistedPlayerStateSchema.safeParse(raw);
  return result.success ? result.data : null;
}

const PLAYER_STATE_KEY = 'player-state';
const PERSIST_INTERVAL_MS = 1000;
// Throttle window for surfacing persist failures. Writes happen at 1Hz, so a
// persistent failure must not toast every tick — show it at most once per
// window.
const WRITE_FAILURE_TOAST_THROTTLE_MS = 60_000;

let lastWriteFailureToastAt = 0;

/** Surface a playback-resume persist failure as a calm, throttled toast. */
function surfaceWriteFailure(err: unknown): void {
  logger.warn('Failed to persist player-state', err);
  const now = Date.now();
  if (now - lastWriteFailureToastAt < WRITE_FAILURE_TOAST_THROTTLE_MS) return;
  lastWriteFailureToastAt = now;
  toast.warning(i18n.t('playbackSaveFailed', { ns: 'toast' }), {
    id: 'playback-save-failed',
  });
}

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
        const [settings, savedRaw] = await Promise.all([
          window.electronAPI.store.get<SettingsData>('settings'),
          window.electronAPI.store.get<unknown>(PLAYER_STATE_KEY),
        ]);

        // Validate the persisted blob; on a shape mismatch drop the stored key
        // (reset-on-mismatch) so a corrupt/foreign value can't wedge restore.
        const savedState = savedRaw == null ? null : parsePersistedPlayerState(savedRaw);
        if (savedRaw != null && savedState === null) {
          logger.warn('Discarding invalid persisted player-state');
          window.electronAPI.store
            .delete(PLAYER_STATE_KEY)
            .catch(err => logger.warn('Failed to clear invalid persisted player-state', err));
        }

        if (!cancelled) {
          const rememberPlaybackPosition = Boolean(settings?.rememberPlaybackPosition);
          setShouldRestore(rememberPlaybackPosition);
          setPersistedState(savedState);
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

        // Tracks whose files moved/were removed since the state was saved are
        // dropped during restore. Count them so we can tell the user rather
        // than silently shrinking their queue. When the current track itself is
        // gone (restoredIndex < 0) the whole persisted queue is unrestorable.
        const droppedCount =
          restoredIndex < 0
            ? state.queuePaths.length
            : Math.max(0, state.queuePaths.length - restoredQueue.length);
        if (droppedCount > 0) {
          toast.warning(i18n.t('playbackRestorePartial', { ns: 'toast', count: droppedCount }));
        }

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

  // Cheap scalar dedupe key for the last persisted snapshot. `undefined` means
  // "never persisted this session" so the first write always goes through; an
  // empty string means "last action was a delete (no track)". Used to skip
  // redundant 1Hz writes when the player is paused and nothing has changed,
  // without paying a full-queue serialize on every tick. Queue/track/index
  // changes are caught by the change-driven effect below (which forces a
  // write), so the key only needs the scalars the interval can observe.
  const lastKeyRef = useRef<string | undefined>(undefined);

  // Single persist path shared by the 1Hz interval and the change-driven effect.
  // Persists when playing (currentTime is advancing, so resume stays fresh),
  // when forced (change events / unload / teardown), or when the cheap key
  // differs from the last write. Skips the steady stream of identical writes
  // while paused/hidden — and avoids building queuePaths / serializing the
  // queue at all on those skipped ticks.
  const persistState = useCallback((force = false) => {
    const { currentTrack, queueIndex, currentTime, isPlaying } = usePlaybackStore.getState();

    if (!currentTrack) {
      if (force || lastKeyRef.current !== '') {
        lastKeyRef.current = '';
        window.electronAPI.store
          .delete(PLAYER_STATE_KEY)
          .catch(err => logger.warn('Failed to clear persisted player-state', err));
      }
      return;
    }

    const key = `${currentTrack.filePath}|${queueIndex}|${currentTime}|${isPlaying}`;
    if (!force && !isPlaying && key === lastKeyRef.current) {
      return;
    }

    const state = buildPersistedState();
    if (!state) return;

    lastKeyRef.current = key;
    window.electronAPI.store.set(PLAYER_STATE_KEY, state).catch(surfaceWriteFailure);
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON || !enabled || !isReady || !isRestoreResolved) return;

    const intervalId = window.setInterval(() => persistState(), PERSIST_INTERVAL_MS);
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
