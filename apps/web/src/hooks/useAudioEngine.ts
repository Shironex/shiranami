import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';

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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Smooth time-update loop via requestAnimationFrame
  const updateTime = useCallback(() => {
    if (audioRef.current && !seekingRef.current) {
      _setCurrentTime(audioRef.current.currentTime);
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
      _setCurrentTime(0);
      _setDuration(0);
      return;
    }

    _setIsLoading(true);
    _setError(null);

    // Use custom protocol to serve local audio through Electron's network stack
    const normalized = currentTrack.filePath.replace(/\\/g, '/');
    audio.src = `shiranami-audio://play/${encodeURIComponent(normalized)}`;
    audio.load();
  }, [currentTrack, _setIsLoading, _setError, _setCurrentTime, _setDuration]);

  // Sync play / pause with the Audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (isPlaying) {
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

  // Detect store-driven seeks (user scrubbing the progress bar)
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (
        audioRef.current &&
        state.currentTime !== prev.currentTime &&
        isFinite(state.currentTime) &&
        Math.abs(state.currentTime - audioRef.current.currentTime) > 1
      ) {
        seekingRef.current = true;
        audioRef.current.currentTime = state.currentTime;
        setTimeout(() => {
          seekingRef.current = false;
        }, 100);
      }
    });
    return unsub;
  }, []);

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
