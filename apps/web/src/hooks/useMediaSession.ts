import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';

/**
 * Integrates with:
 * 1. navigator.mediaSession — for OS media overlay (Windows media popup, macOS Now Playing)
 * 2. Electron IPC — listens for media:command from main process (global shortcuts)
 * 3. Sends playback state back to main process for tray/taskbar updates
 */
export function useMediaSession() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const stop = usePlayerStore(s => s.stop);
  const seek = usePlayerStore(s => s.seek);

  // Throttle state updates to main process (every 1 second)
  const lastUpdateRef = useRef(0);

  // Set up Media Session API action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      if (!usePlayerStore.getState().isPlaying) togglePlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (usePlayerStore.getState().isPlaying) togglePlay();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('previoustrack', () => previous());
    navigator.mediaSession.setActionHandler('stop', () => stop());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) {
        seek(details.seekTime);
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [togglePlay, next, previous, stop, seek]);

  // Update Media Session metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const artwork: MediaImage[] = [];
    if (currentTrack.albumArt) {
      artwork.push({ src: currentTrack.albumArt, sizes: '512x512' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork,
    });
  }, [currentTrack]);

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Update position state for seek bar in OS media overlay
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

  // Listen for media commands from Electron main process
  useEffect(() => {
    if (!IS_ELECTRON) return;

    const unsub = window.electronAPI.media.onCommand((command: string) => {
      switch (command) {
        case 'toggle-play':
          togglePlay();
          break;
        case 'next':
          next();
          break;
        case 'previous':
          previous();
          break;
        case 'stop':
          stop();
          break;
      }
    });

    return unsub;
  }, [togglePlay, next, previous, stop]);

  // Send playback state to main process (throttled)
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
}
