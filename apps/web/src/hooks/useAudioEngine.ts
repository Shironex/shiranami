import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';
import { initAnalyser, destroyAnalyser } from '@/lib/audioAnalyser';

/**
 * Audio engine hook — creates and manages the HTML5 Audio element,
 * keeping it in sync with the player store.
 *
 * Must be mounted exactly once at the app root level.
 */
export function useAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  const seekingRef = useRef(false);
  const analyserInitRef = useRef(false);

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

  // Initialize the audio element once on mount
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    return () => {
      destroyAnalyser();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      _setIsLoading(false);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [_setIsLoading]);

  // Smooth time-update loop via requestAnimationFrame
  const updateTime = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      // Check for pending seek (set by store's seek() action)
      const { _seekTarget } = usePlayerStore.getState();
      if (_seekTarget !== null && isFinite(_seekTarget)) {
        audio.currentTime = _seekTarget;
        usePlayerStore.getState()._clearSeekTarget();
        seekingRef.current = true;
        setTimeout(() => { seekingRef.current = false; }, 300);
      } else if (!seekingRef.current) {
        _setCurrentTime(audio.currentTime);
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
      audio.pause();
      audio.src = '';
      _setIsLoading(false);
      _setCurrentTime(0);
      _setDuration(0);
      return;
    }

    _setIsLoading(true);
    _setError(null);

    // Increment play count in the database
    if (IS_ELECTRON) {
      window.electronAPI.db.tracks.incrementPlayCount(currentTrack.id).catch(() => {});
    }

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

    // Use custom protocol to serve local audio through Electron's network stack.
    // The readiness listener is attached first so fast local files cannot beat it.
    const normalized = currentTrack.filePath.replace(/\\/g, '/');
    audio.src = `shiranami-audio://play?path=${encodeURIComponent(normalized)}`;
    audio.load();

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      onCanPlayOnce();
    }

    return () => {
      audio.removeEventListener('canplay', onCanPlayOnce);
    };
  }, [currentTrack, _setIsLoading, _setError, _setCurrentTime, _setDuration, _setIsPlaying, updateTime]);

  // Sync play / pause with the Audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (isPlaying) {
      // Lazily initialise the Web Audio analyser on first play (requires user gesture)
      if (!analyserInitRef.current) {
        try {
          initAnalyser(audio);
          analyserInitRef.current = true;
        } catch {
          // Non-critical — visualiser just won't work
        }
      }

      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch((err: DOMException) => {
          // AbortError fires when a play() is interrupted by a new load — safe to ignore
          if (err.name !== 'AbortError') {
            _setError(err.message);
            _setIsPlaying(false);
          }
        });
      }
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
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
      _onTrackEnd();
    };

    const onError = () => {
      const msg = audio.error?.message || 'Failed to load audio file';
      _setError(msg);
      _setIsLoading(false);
      _setIsPlaying(false);
    };

    const onWaiting = () => _setIsLoading(true);
    const onPlaying = () => _setIsLoading(false);

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
  }, [_setDuration, _setIsLoading, _onTrackEnd, _setError, _setIsPlaying]);

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
