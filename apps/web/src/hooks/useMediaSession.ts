import { useEffect } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { IS_ELECTRON } from '@/lib/platform';

/**
 * Integrates with:
 * 1. navigator.mediaSession — for OS media overlay (Windows media popup, macOS Now Playing)
 * 2. Electron IPC — listens for media:command from main process (global shortcuts)
 *
 * This hook intentionally does NOT subscribe to currentTime — that high-frequency
 * value (written every 250ms) is owned by the isolated <MediaSessionSync/> leaf so
 * the host (root App) does not re-render 4x/sec. Mount <MediaSessionSync/> once
 * alongside this hook.
 */
export function useMediaSession() {
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const togglePlay = usePlaybackStore(s => s.togglePlay);
  const next = usePlaybackStore(s => s.next);
  const previous = usePlaybackStore(s => s.previous);
  const stop = usePlaybackStore(s => s.stop);
  const seek = usePlaybackStore(s => s.seek);

  // Set up Media Session API action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      if (!usePlaybackStore.getState().isPlaying) togglePlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (usePlaybackStore.getState().isPlaying) togglePlay();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('previoustrack', () => previous());
    navigator.mediaSession.setActionHandler('stop', () => stop());
    navigator.mediaSession.setActionHandler('seekto', details => {
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

  // Update Media Session metadata when track changes.
  // The W3C MediaSession spec restricts MediaImage.src to http/https/data/blob
  // schemes, so shiranami-art:// covers must be fetched and re-served as a
  // blob URL. Same applies if the user ever lands on a covers-from-disk path
  // that surfaces as anything but http/data/blob.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const { title, artist, album, albumArt } = currentTrack;

    let blobUrl: string | null = null;
    let cancelled = false;

    const setMetadata = (artwork: MediaImage[]) => {
      if (cancelled) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork,
      });
    };

    if (!albumArt) {
      setMetadata([]);
      return;
    }

    const isMediaSessionSupportedScheme =
      albumArt.startsWith('http') || albumArt.startsWith('data:') || albumArt.startsWith('blob:');

    if (isMediaSessionSupportedScheme) {
      setMetadata([{ src: albumArt, sizes: '512x512' }]);
      return;
    }

    fetch(albumArt)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setMetadata([{ src: blobUrl, sizes: '512x512' }]);
      })
      .catch(() => {
        setMetadata([]);
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [currentTrack]);

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Listen for media commands from Electron main process
  useEffect(() => {
    if (!IS_ELECTRON) return;

    const unsub = window.electronAPI.media.onCommand((command: string) => {
      switch (command) {
        case 'toggle-play':
          togglePlay();
          break;
        // `play` and `pause` reach this channel only under the Tauri backend.
        // The OS remote has always had two separate buttons; v1 answered them
        // renderer-side through `navigator.mediaSession.setActionHandler`, which
        // is suppressed now that souvlaki is the single source of OS media
        // integration — so they travel over IPC instead and land here.
        //
        // The guards are the ones the mediaSession handlers above use, and they
        // are why this cannot live in the bridge: only the store knows whether
        // playback is already running, and a remote that sends `play` while
        // playing must not toggle to paused.
        case 'play':
          if (!usePlaybackStore.getState().isPlaying) togglePlay();
          break;
        case 'pause':
          if (usePlaybackStore.getState().isPlaying) togglePlay();
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
}
