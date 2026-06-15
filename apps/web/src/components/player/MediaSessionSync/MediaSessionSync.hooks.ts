import { useEffect, useRef } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { IS_ELECTRON } from '@/lib/platform';
import type { IMediaSessionSyncView } from './MediaSessionSync.types';

/**
 * Owns the currentTime-dependent media-session side-effects (OS overlay position
 * state + throttled playback-state IPC to the main process).
 *
 * currentTime is written to the store every 250ms during playback. Subscribing
 * to it here — in a hook backing a component that renders null — keeps the
 * re-render contained to this leaf instead of the root App tree (mirrors the
 * TimeDisplay pattern). The action handlers / metadata / playbackState live in
 * useMediaSession, which no longer touches currentTime.
 */
export function useMediaSessionSync(): IMediaSessionSyncView {
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const currentTime = usePlaybackStore(s => s.currentTime);
  const duration = usePlaybackStore(s => s.duration);

  // Throttle state updates to the main process (every 1 second).
  const lastUpdateRef = useRef(0);

  // Update position state for the seek bar in the OS media overlay.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration || !isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(currentTime, duration),
      });
    } catch {
      // Some browsers don't support setPositionState
    }
  }, [currentTime, duration]);

  // Send playback state to the main process (throttled to 1Hz).
  useEffect(() => {
    if (!IS_ELECTRON) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < 1000 && lastUpdateRef.current > 0) return;
    lastUpdateRef.current = now;

    if (!currentTrack) {
      window.electronAPI.media.clearState();
      return;
    }

    window.electronAPI.media.sendPlaybackState({
      isPlaying,
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      duration,
      currentTime,
      albumArt: currentTrack.albumArt ?? null,
    });
  }, [currentTrack, isPlaying, currentTime, duration]);

  return {};
}
