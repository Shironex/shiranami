import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore, currentTimeRef, type Track } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';
import { initAnalyser, destroyAnalyser } from '@/lib/audioAnalyser';
import { emitListeningHistoryUpdated } from '@/lib/listeningHistory';

/** Minimum interval (ms) between Zustand store updates for currentTime. */
const STORE_UPDATE_INTERVAL = 250;
const MIN_HISTORY_SECONDS = 30;
const MIN_HISTORY_COMPLETION_RATIO = 0.5;
const MAX_SESSION_DELTA_SECONDS = 1;

function isRadioTrack(filePath: string): boolean {
  return filePath.startsWith('shiranami-radio://');
}

/**
 * Audio engine hook - creates and manages the HTML5 Audio element,
 * keeping it in sync with the player store.
 *
 * Must be mounted exactly once at the app root level.
 */
export function useAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  const seekingRef = useRef(false);
  const analyserInitRef = useRef(false);
  const lastStoreUpdateRef = useRef(0);
  const playbackSessionRef = useRef<{
    track: Track | null;
    listenedSeconds: number;
    lastTickAt: number | null;
    recorded: boolean;
  }>({
    track: null,
    listenedSeconds: 0,
    lastTickAt: null,
    recorded: false,
  });

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const repeatMode = usePlayerStore((s) => s.repeatMode);

  const _setCurrentTime = usePlayerStore((s) => s._setCurrentTime);
  const _setDuration = usePlayerStore((s) => s._setDuration);
  const _setIsPlaying = usePlayerStore((s) => s._setIsPlaying);
  const _setIsLoading = usePlayerStore((s) => s._setIsLoading);
  const _setError = usePlayerStore((s) => s._setError);
  const _onTrackEnd = usePlayerStore((s) => s._onTrackEnd);
  const incrementTrackPlayCount = usePlayerStore((s) => s.incrementTrackPlayCount);

  const resetPlaybackSession = useCallback((track: Track | null) => {
    playbackSessionRef.current = {
      track: track && !isRadioTrack(track.filePath) ? track : null,
      listenedSeconds: 0,
      lastTickAt: null,
      recorded: false,
    };
  }, []);

  const flushPlaybackSession = useCallback(async () => {
    if (!IS_ELECTRON) return;

    const session = playbackSessionRef.current;
    const track = session.track;
    const playedSeconds = session.listenedSeconds;
    const duration = track?.duration ?? usePlayerStore.getState().duration ?? 0;
    const completionRatio = duration > 0 ? playedSeconds / duration : 0;
    const shouldRecord =
      !!track &&
      !session.recorded &&
      (playedSeconds >= MIN_HISTORY_SECONDS || completionRatio >= MIN_HISTORY_COMPLETION_RATIO);

    session.lastTickAt = null;

    if (!track || !shouldRecord) return;

    session.recorded = true;

    try {
      await window.electronAPI.db.history.recordPlay({
        trackId: track.id,
        playedSeconds,
        duration,
        source: 'library',
      });
      incrementTrackPlayCount(track.id);
      emitListeningHistoryUpdated();
    } catch {
      session.recorded = false;
    }
  }, [incrementTrackPlayCount]);

  // Initialize the audio element once on mount
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    return () => {
      destroyAnalyser();
      void flushPlaybackSession();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      _setIsLoading(false);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [_setIsLoading, flushPlaybackSession]);

  // Smooth time-update loop via requestAnimationFrame.
  // The mutable currentTimeRef is updated every frame for smooth SeekBar animation,
  // but the Zustand store is only updated at ~4Hz to avoid excessive React re-renders.
  const updateTime = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      // Check for pending seek (set by store's seek() action)
      const { _seekTarget } = usePlayerStore.getState();
      if (_seekTarget !== null && isFinite(_seekTarget)) {
        audio.currentTime = _seekTarget;
        usePlayerStore.getState()._clearSeekTarget();
        seekingRef.current = true;
        playbackSessionRef.current.lastTickAt = performance.now();
        setTimeout(() => { seekingRef.current = false; }, 300);
      } else if (!seekingRef.current) {
        const session = playbackSessionRef.current;
        const tickNow = performance.now();
        const canAccumulate =
          session.track &&
          !audio.paused &&
          !audio.ended &&
          !audio.seeking &&
          audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

        if (canAccumulate) {
          if (session.lastTickAt !== null) {
            session.listenedSeconds += Math.max(
              0,
              Math.min(MAX_SESSION_DELTA_SECONDS, (tickNow - session.lastTickAt) / 1000),
            );
          }
          session.lastTickAt = tickNow;
        } else if (session.track) {
          session.lastTickAt = tickNow;
        }

        // Always update the mutable ref at full frame rate
        currentTimeRef.current = audio.currentTime;

        // Throttle Zustand store updates to ~4Hz
        const storeUpdateNow = performance.now();
        if (storeUpdateNow - lastStoreUpdateRef.current >= STORE_UPDATE_INTERVAL) {
          lastStoreUpdateRef.current = storeUpdateNow;
          _setCurrentTime(audio.currentTime);
        }
      }
    }
    if (usePlayerStore.getState().isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [_setCurrentTime]);

  // Load a new track when currentTrack changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      void flushPlaybackSession();
      resetPlaybackSession(null);
      audio.pause();
      audio.src = '';
      _setIsLoading(false);
      _setCurrentTime(0);
      _setDuration(0);
      return;
    }

    if (playbackSessionRef.current.track?.id !== currentTrack.id) {
      void flushPlaybackSession();
      resetPlaybackSession(currentTrack);
    }

    _setIsLoading(true);
    _setError(null);

    // Auto-play once the audio is ready (canplay fires after load)
    const onCanPlayOnce = () => {
      audio.removeEventListener('canplay', onCanPlayOnce);
      _setIsLoading(false);
      if (usePlayerStore.getState().isPlaying) {
        audio.play().catch(err => {
          if (err.name !== 'AbortError') {
            _setError(err.message);
            _setIsPlaying(false);
          }
        });
        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };
    audio.addEventListener('canplay', onCanPlayOnce);

    // Radio streams use their own protocol; local files use shiranami-audio://
    if (currentTrack.filePath.startsWith('shiranami-radio://')) {
      audio.src = currentTrack.filePath;
    } else {
      // Use custom protocol to serve local audio through Electron's network stack.
      // The readiness listener is attached first so fast local files cannot beat it.
      const normalized = currentTrack.filePath.replace(/\\/g, '/');
      audio.src = `shiranami-audio://play?path=${encodeURIComponent(normalized)}`;
    }
    audio.load();

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      onCanPlayOnce();
    }

    return () => {
      audio.removeEventListener('canplay', onCanPlayOnce);
    };
  }, [currentTrack, _setIsLoading, _setError, _setCurrentTime, _setDuration, _setIsPlaying, updateTime, flushPlaybackSession, resetPlaybackSession]);

  // Sync play / pause with the Audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (isPlaying) {
      playbackSessionRef.current.lastTickAt = performance.now();

      // Lazily initialise the Web Audio analyser on first play (requires user gesture)
      if (!analyserInitRef.current) {
        try {
          initAnalyser(audio);
          analyserInitRef.current = true;
        } catch {
          // Non-critical - visualiser just won't work
        }
      }

      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch((err: DOMException) => {
          // AbortError fires when a play() is interrupted by a new load - safe to ignore
          if (err.name !== 'AbortError') {
            _setError(err.message);
            _setIsPlaying(false);
          }
        });
      }
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      playbackSessionRef.current.lastTickAt = null;
      audio.pause();
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isPlaying, updateTime, _setError, _setIsPlaying]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Handle seeks that happen while paused (RAF loop not running)
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      const audio = audioRef.current;
      if (
        audio &&
        state._seekTarget !== null &&
        isFinite(state._seekTarget) &&
        !usePlayerStore.getState().isPlaying
      ) {
        audio.currentTime = state._seekTarget;
        usePlayerStore.getState()._clearSeekTarget();
        _setCurrentTime(state._seekTarget);
      }
    });
    return unsub;
  }, [_setCurrentTime]);

  // Attach Audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setDurationSafe = () => {
      const d = audio.duration;
      if (isFinite(d) && d > 0) {
        _setDuration(d);
      }
    };

    const onLoadedMetadata = () => {
      setDurationSafe();
      _setIsLoading(false);
    };

    // duration may start as Infinity for streamed content and resolve later
    const onDurationChange = () => {
      setDurationSafe();
    };

    const onCanPlay = () => {
      setDurationSafe();
      _setIsLoading(false);
    };

    const onEnded = () => {
      const endedTrack = usePlayerStore.getState().currentTrack;
      void flushPlaybackSession();
      if (usePlayerStore.getState().repeatMode === 'one' && endedTrack) {
        resetPlaybackSession(endedTrack);
      }
      _onTrackEnd();
    };

    const onError = () => {
      const msg = audio.error?.message || 'Failed to load audio file';
      _setError(msg);
      _setIsLoading(false);
      _setIsPlaying(false);
    };

    const onWaiting = () => {
      playbackSessionRef.current.lastTickAt = null;
      _setIsLoading(true);
    };
    const onPlaying = () => {
      playbackSessionRef.current.lastTickAt = performance.now();
      _setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
    };
  }, [_setDuration, _setIsLoading, _onTrackEnd, _setError, _setIsPlaying, flushPlaybackSession, resetPlaybackSession]);

  // Handle repeat-one at the Audio element level: restart playback directly
  // so there is no audible gap (the store handler prevents next() from firing).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    };

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [repeatMode]);

  return audioRef;
}
