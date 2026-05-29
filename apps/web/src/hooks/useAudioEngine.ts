import { useEffect, useRef, useCallback } from 'react';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import type { Track } from '@/stores/types';
import { IS_ELECTRON } from '@/lib/platform';
import {
  initAnalyser,
  destroyAnalyser,
  setDeckGain,
  isAnalyserReady,
  resumeAudioContext,
  initEq,
  applyEqPreset,
  setEqEnabled,
  setPreampDb,
} from '@/lib/audioAnalyser';
import { useEqStore } from '@/stores/useEqStore';
import { queryClient } from '@/lib/queryClient';
import { historyKeys } from '@/hooks/queries/useHistory';
import { isRadioTrack } from '@/lib/utils';

/** Minimum interval (ms) between Zustand store updates for currentTime. */
const STORE_UPDATE_INTERVAL = 250;
const MIN_HISTORY_SECONDS = 30;
const MIN_HISTORY_COMPLETION_RATIO = 0.5;
const MAX_SESSION_DELTA_SECONDS = 1;

type Deck = 'A' | 'B';

function getTrackSrc(track: Track): string {
  if (track.filePath.startsWith('shiranami-radio://')) return track.filePath;
  const normalized = track.filePath.replace(/\\/g, '/');
  return `shiranami-audio://play?path=${encodeURIComponent(normalized)}`;
}

/**
 * Equal-power crossfade curves for smooth transitions. Also reused by the
 * sleep-timer fade-out (active deck only). Exported for unit testing.
 */
export function fadeOut(progress: number): number {
  return Math.cos(progress * Math.PI * 0.5);
}
export function fadeIn(progress: number): number {
  return Math.sin(progress * Math.PI * 0.5);
}

/**
 * Audio engine hook - creates and manages two HTML5 Audio elements (deck A/B),
 * keeping them in sync with the player store and handling crossfade transitions.
 *
 * Must be mounted exactly once at the app root level.
 */
export function useAudioEngine() {
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<Deck>('A');

  const animationFrameRef = useRef<number>(0);
  const seekingRef = useRef(false);

  // Sleep-timer fade-out state. While `active`, the RAF loop ramps the active
  // deck's gain down to silence over `duration` seconds using the equal-power
  // fadeOut curve (reusing the crossfade ramp), mirroring the crossfade branch.
  const sleepFadeRef = useRef<{ active: boolean; startTime: number; duration: number }>({
    active: false,
    startTime: 0,
    duration: 0,
  });

  const analyserInitRef = useRef(false);
  const lastStoreUpdateRef = useRef(0);

  // Track which track ID is loaded on each deck
  const deckTrackIdRef = useRef<{ A: string | null; B: string | null }>({
    A: null,
    B: null,
  });

  // Crossfade state
  const crossfadeRef = useRef<{
    active: boolean;
    startTime: number;
    duration: number; // seconds
    outgoingDeck: Deck;
    incomingDeck: Deck;
  }>({ active: false, startTime: 0, duration: 0, outgoingDeck: 'A', incomingDeck: 'B' });

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

  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const volume = usePlaybackStore(s => s.volume);
  const isMuted = usePlaybackStore(s => s.isMuted);
  const repeatMode = usePlaybackStore(s => s.repeatMode);

  const _setCurrentTime = usePlaybackStore(s => s._setCurrentTime);
  const _setDuration = usePlaybackStore(s => s._setDuration);
  const _setIsPlaying = usePlaybackStore(s => s._setIsPlaying);
  const _setIsLoading = usePlaybackStore(s => s._setIsLoading);
  const _setError = usePlaybackStore(s => s._setError);
  const _onTrackEnd = usePlaybackStore(s => s._onTrackEnd);
  const incrementTrackPlayCount = useLibraryStore(s => s.incrementTrackPlayCount);

  function getDeck(deck: Deck) {
    return deck === 'A' ? deckARef.current : deckBRef.current;
  }
  function getActiveDeck() {
    return getDeck(activeDeckRef.current);
  }
  function getIdleDeck() {
    return getDeck(activeDeckRef.current === 'A' ? 'B' : 'A');
  }
  function getIdleDeckId(): Deck {
    return activeDeckRef.current === 'A' ? 'B' : 'A';
  }

  /** Set volume on a deck, using GainNode if Web Audio is ready, else audio.volume. */
  function setVolume(deck: Deck, value: number) {
    const audio = getDeck(deck);
    if (isAnalyserReady()) {
      setDeckGain(deck, value);
      // Once captured by MediaElementAudioSourceNode, volume is controlled
      // exclusively via GainNodes. However, Chromium still attenuates the
      // signal feeding into the MESN by audio.volume — if it was set to 0
      // before the analyser was initialised (e.g. idle deck on mount), the
      // MESN permanently receives silence. Keep it at 1 to avoid this.
      if (audio && audio.volume !== 1) audio.volume = 1;
    } else {
      if (audio) audio.volume = value;
    }
  }

  // ── Playback session (listening history) ──────────────────────

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
    const duration = track?.duration ?? usePlaybackStore.getState().duration ?? 0;
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
      queryClient.invalidateQueries({ queryKey: historyKeys.all });
    } catch {
      session.recorded = false;
    }
  }, [incrementTrackPlayCount]);

  // ── Crossfade helpers ─────────────────────────────────────────

  const cancelCrossfade = useCallback(() => {
    if (!crossfadeRef.current.active) return;
    const cf = crossfadeRef.current;
    const idle = getDeck(cf.incomingDeck);
    if (idle) {
      idle.pause();
      idle.src = '';
    }
    deckTrackIdRef.current[cf.incomingDeck] = null;
    setVolume(cf.incomingDeck, 0);
    crossfadeRef.current = {
      active: false,
      startTime: 0,
      duration: 0,
      outgoingDeck: 'A',
      incomingDeck: 'B',
    };
  }, []);

  const startCrossfade = useCallback(() => {
    // Guard: don't start a new crossfade while one is already in progress
    if (crossfadeRef.current.active) return;

    const state = usePlaybackStore.getState();
    const { queue, queueIndex, repeatMode: rm, crossfadeDuration } = state;

    // Determine next track
    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      if (rm === 'all') nextIndex = 0;
      else return; // No next track, let it end naturally
    }
    const nextTrack = queue[nextIndex];
    if (!nextTrack || isRadioTrack(nextTrack.filePath)) return;

    const incomingDeckId = getIdleDeckId();
    const incomingAudio = getIdleDeck();
    if (!incomingAudio) return;

    // Flush history for outgoing track
    void flushPlaybackSession();

    // Load next track on idle deck
    incomingAudio.src = getTrackSrc(nextTrack);
    incomingAudio.load();
    deckTrackIdRef.current[incomingDeckId] = nextTrack.id;

    // Set crossfade state BEFORE registering canplay listener so the
    // onCanPlay guard always sees active === true (fixes race where
    // cached audio fires canplay synchronously or the eager readyState
    // check passes before the ref is assigned).
    crossfadeRef.current = {
      active: true,
      startTime: performance.now(),
      duration: crossfadeDuration,
      outgoingDeck: activeDeckRef.current,
      incomingDeck: incomingDeckId,
    };

    const onCanPlay = () => {
      incomingAudio.removeEventListener('canplay', onCanPlay);
      if (!crossfadeRef.current.active) return;
      resumeAudioContext();
      setVolume(incomingDeckId, 0);
      incomingAudio.play().catch(() => {});
    };
    incomingAudio.addEventListener('canplay', onCanPlay);

    if (incomingAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      onCanPlay();
    }
  }, [flushPlaybackSession]);

  const completeCrossfade = useCallback(() => {
    const cf = crossfadeRef.current;
    if (!cf.active) return;

    const userVol = usePlaybackStore.getState().isMuted ? 0 : usePlaybackStore.getState().volume;

    // Ensure AudioContext is running before finalising
    resumeAudioContext();

    // Final volumes
    setVolume(cf.outgoingDeck, 0);
    setVolume(cf.incomingDeck, userVol);

    // Stop outgoing deck
    const outgoing = getDeck(cf.outgoingDeck);
    if (outgoing) {
      outgoing.pause();
      outgoing.src = '';
    }
    deckTrackIdRef.current[cf.outgoingDeck] = null;

    // Swap active deck
    activeDeckRef.current = cf.incomingDeck;

    // Sync duration from the incoming deck element (the event-listener effect
    // wasn't watching this deck during crossfade, so the store may still show
    // the outgoing track's duration)
    const incoming = getDeck(cf.incomingDeck);
    if (incoming) {
      const d = incoming.duration;
      if (isFinite(d) && d > 0) _setDuration(d);

      // Ensure the incoming deck is actually producing audio. If play() was
      // silently rejected during startCrossfade the element sits paused with
      // gain ramped up — the user hears nothing, permanently.
      if (incoming.paused && incoming.src) {
        incoming.play().catch(() => {});
      }
    }
    _setIsLoading(false);

    // Reset session for new track
    const { queue, queueIndex, repeatMode } = usePlaybackStore.getState();
    const nextTrack = queue[queueIndex + 1] ?? (repeatMode === 'all' ? queue[0] : null);
    resetPlaybackSession(nextTrack);

    // Clear crossfade state before store update (prevents re-triggering)
    crossfadeRef.current = {
      active: false,
      startTime: 0,
      duration: 0,
      outgoingDeck: 'A',
      incomingDeck: 'B',
    };

    // Advance the store (this sets currentTrack, triggering the load effect —
    // the effect will see the track is already loaded on the new active deck and skip reload)
    usePlaybackStore.getState().next();
  }, [resetPlaybackSession, _setDuration, _setIsLoading]);

  // ── Initialization ────────────────────────────────────────────

  useEffect(() => {
    if (!deckARef.current) {
      deckARef.current = new Audio();
      deckARef.current.preload = 'auto';
      // Required so MediaElementAudioSourceNode receives actual samples;
      // without it Web Audio outputs silent zeroes for cross-origin sources.
      // shiranami-audio:// is registered with corsEnabled, so the protocol
      // handler serves with permissive CORS headers.
      deckARef.current.crossOrigin = 'anonymous';
    }
    if (!deckBRef.current) {
      deckBRef.current = new Audio();
      deckBRef.current.preload = 'auto';
      deckBRef.current.crossOrigin = 'anonymous';
    }
    return () => {
      destroyAnalyser();
      void flushPlaybackSession();
      for (const ref of [deckARef, deckBRef]) {
        if (ref.current) {
          ref.current.pause();
          ref.current.src = '';
          ref.current = null;
        }
      }
      _setIsLoading(false);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [_setIsLoading, flushPlaybackSession]);

  // ── RAF time-update loop (with crossfade monitoring) ──────────

  const updateTime = useCallback(() => {
    const audio = getActiveDeck();
    if (audio) {
      // Handle pending seek
      const { _seekTarget } = usePlaybackStore.getState();
      if (_seekTarget !== null && isFinite(_seekTarget)) {
        audio.currentTime = _seekTarget;
        usePlaybackStore.getState()._clearSeekTarget();
        seekingRef.current = true;
        playbackSessionRef.current.lastTickAt = performance.now();
        setTimeout(() => {
          seekingRef.current = false;
        }, 300);
      } else if (!seekingRef.current) {
        // Accumulate listening time
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
              Math.min(MAX_SESSION_DELTA_SECONDS, (tickNow - session.lastTickAt) / 1000)
            );
          }
          session.lastTickAt = tickNow;
        } else if (session.track) {
          session.lastTickAt = tickNow;
        }

        currentTimeRef.current = audio.currentTime;

        const storeUpdateNow = performance.now();
        if (storeUpdateNow - lastStoreUpdateRef.current >= STORE_UPDATE_INTERVAL) {
          lastStoreUpdateRef.current = storeUpdateNow;
          _setCurrentTime(audio.currentTime);
        }
      }

      // ── Sleep-timer fade-out ──
      // Reuse the equal-power crossfade curve to ramp the active deck down to
      // silence before the timer pauses. A crossfade owns deck volumes while
      // active, so we don't fight it — let the deferred pause handle that case.
      const sf = sleepFadeRef.current;
      const sleepFading = usePlaybackStore.getState()._sleepFading;
      if (sleepFading && !crossfadeRef.current.active) {
        const s = usePlaybackStore.getState();
        const userVol = s.isMuted ? 0 : s.volume;
        if (!sf.active) {
          sf.active = true;
          sf.startTime = performance.now();
          sf.duration = Math.max(0.1, s.sleepFadeDuration);
        }
        const progress = Math.min(1, (performance.now() - sf.startTime) / (sf.duration * 1000));
        setVolume(activeDeckRef.current, userVol * fadeOut(progress));
      } else if (sf.active) {
        // Fade ended — either it completed (store paused us) or it was
        // cancelled (timer cancelled while still playing). Restore the prior
        // volume so the next play / continued playback isn't silent.
        sf.active = false;
        const s = usePlaybackStore.getState();
        setVolume(activeDeckRef.current, s.isMuted ? 0 : s.volume);
      }

      // ── Crossfade monitoring ──
      const cf = crossfadeRef.current;
      const state = usePlaybackStore.getState();

      if (cf.active) {
        // Update crossfade volumes
        const elapsed = (performance.now() - cf.startTime) / 1000;
        const progress = Math.min(1, elapsed / cf.duration);
        const userVol = state.isMuted ? 0 : state.volume;

        setVolume(cf.outgoingDeck, userVol * fadeOut(progress));
        setVolume(cf.incomingDeck, userVol * fadeIn(progress));

        if (progress >= 1) {
          completeCrossfade();
        }
      } else if (
        state.crossfadeEnabled &&
        state.isPlaying &&
        !isRadioTrack(state.currentTrack?.filePath ?? '') &&
        state.repeatMode !== 'one'
      ) {
        // Check if we should start crossfade
        const dur = audio.duration;
        if (isFinite(dur) && dur > 0 && dur > state.crossfadeDuration) {
          const timeLeft = dur - audio.currentTime;
          if (timeLeft <= state.crossfadeDuration && timeLeft > 0.1) {
            startCrossfade();
          }
        }
      }
    }

    if (usePlaybackStore.getState().isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [_setCurrentTime, completeCrossfade, startCrossfade]);

  // ── Load track when currentTrack changes ──────────────────────

  useEffect(() => {
    const audio = getActiveDeck();
    if (!audio) return;

    if (!currentTrack) {
      cancelCrossfade();
      void flushPlaybackSession();
      resetPlaybackSession(null);
      audio.pause();
      audio.src = '';
      deckTrackIdRef.current[activeDeckRef.current] = null;
      _setIsLoading(false);
      _setCurrentTime(0);
      _setDuration(0);
      return;
    }

    // If this track is already loaded on the active deck (crossfade completed
    // or same track), skip reloading
    if (deckTrackIdRef.current[activeDeckRef.current] === currentTrack.id) {
      _setIsLoading(false);
      return;
    }

    // If loaded on the idle deck (crossfade advanced the store), swap
    const idleDeckId = getIdleDeckId();
    if (deckTrackIdRef.current[idleDeckId] === currentTrack.id) {
      activeDeckRef.current = idleDeckId;
      _setIsLoading(false);
      return;
    }

    // Cancel any in-progress crossfade (manual skip)
    cancelCrossfade();

    if (playbackSessionRef.current.track?.id !== currentTrack.id) {
      void flushPlaybackSession();
      resetPlaybackSession(currentTrack);
    }

    _setIsLoading(true);
    _setError(null);

    deckTrackIdRef.current[activeDeckRef.current] = currentTrack.id;

    const onCanPlayOnce = () => {
      audio.removeEventListener('canplay', onCanPlayOnce);
      _setIsLoading(false);
      if (usePlaybackStore.getState().isPlaying) {
        resumeAudioContext();
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

    audio.src = getTrackSrc(currentTrack);
    audio.load();

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      onCanPlayOnce();
    }

    return () => {
      audio.removeEventListener('canplay', onCanPlayOnce);
    };
  }, [
    currentTrack,
    cancelCrossfade,
    _setIsLoading,
    _setError,
    _setCurrentTime,
    _setDuration,
    _setIsPlaying,
    updateTime,
    flushPlaybackSession,
    resetPlaybackSession,
  ]);

  // ── Sync play / pause ─────────────────────────────────────────

  useEffect(() => {
    const active = getActiveDeck();
    if (!active || !active.src) return;

    if (isPlaying) {
      playbackSessionRef.current.lastTickAt = performance.now();

      // Lazily initialise the Web Audio analyser on first play
      if (!analyserInitRef.current && deckARef.current && deckBRef.current) {
        try {
          initAnalyser(deckARef.current, deckBRef.current);
          initEq();
          analyserInitRef.current = true;
          // Set initial gains
          const userVol = isMuted ? 0 : volume;
          setDeckGain(activeDeckRef.current, userVol);
          setDeckGain(getIdleDeckId(), 0);

          // Replay the persisted EQ state into the newly-built chain.
          const eq = useEqStore.getState();
          applyEqPreset(eq.gains);
          setPreampDb(eq.preampDb);
          setEqEnabled(eq.enabled);
          if (!eq.enabled) {
            // Ensure bands are flat when disabled on boot.
            applyEqPreset(new Array(eq.gains.length).fill(0));
          }
        } catch {
          // Non-critical - visualiser just won't work
        }
      }

      resumeAudioContext();
      active.play().catch((err: DOMException) => {
        if (err.name !== 'AbortError') {
          _setError(err.message);
          _setIsPlaying(false);
        }
      });

      // Also resume incoming deck if crossfading
      if (crossfadeRef.current.active) {
        const incoming = getDeck(crossfadeRef.current.incomingDeck);
        incoming?.play().catch(() => {});
      }

      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      playbackSessionRef.current.lastTickAt = null;
      _setIsLoading(false);
      active.pause();
      // Also pause incoming deck if crossfading
      if (crossfadeRef.current.active) {
        const incoming = getDeck(crossfadeRef.current.incomingDeck);
        incoming?.pause();
      }
      // If a sleep-timer fade just brought the deck to silence, restore the
      // prior volume now that we're paused — neither the volume-sync effect
      // (deps don't include isPlaying) nor the play effect (only sets gain on
      // first init) would otherwise un-silence the deck on the next play.
      if (sleepFadeRef.current.active && !crossfadeRef.current.active) {
        sleepFadeRef.current.active = false;
        setVolume(activeDeckRef.current, isMuted ? 0 : volume);
        // A manual pause mid-fade abandons the fade entirely — clear the
        // store signal so resuming doesn't re-trigger the ramp. (When the
        // fade completes naturally the sleep-timer store has already cleared
        // this, so this only matters for the manual-pause path.)
        if (usePlaybackStore.getState()._sleepFading) {
          usePlaybackStore.getState()._setSleepFading(false);
        }
      }
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isPlaying, updateTime, _setError, _setIsPlaying, _setIsLoading, volume, isMuted]);

  // ── Sync volume ───────────────────────────────────────────────

  useEffect(() => {
    // During crossfade, volume is managed by the RAF loop
    if (crossfadeRef.current.active) return;

    const userVol = isMuted ? 0 : volume;
    setVolume(activeDeckRef.current, userVol);
    setVolume(getIdleDeckId(), 0);
  }, [volume, isMuted, currentTrack]);

  // ── Sync EQ store into the Web Audio chain ────────────────────

  useEffect(() => {
    // Capture previous values so we only forward what actually changed.
    let prev = useEqStore.getState();
    const unsub = useEqStore.subscribe(state => {
      if (!analyserInitRef.current) {
        prev = state;
        return;
      }

      if (state.enabled !== prev.enabled) {
        if (state.enabled) {
          applyEqPreset(state.gains);
        } else {
          setEqEnabled(false);
        }
      } else if (state.enabled && state.gains !== prev.gains) {
        applyEqPreset(state.gains);
      }

      if (state.preampDb !== prev.preampDb) {
        setPreampDb(state.preampDb);
      }

      prev = state;
    });
    return unsub;
  }, []);

  // ── Handle seeks while paused ─────────────────────────────────

  useEffect(() => {
    const unsub = usePlaybackStore.subscribe(state => {
      const audio = getActiveDeck();
      if (audio && state._seekTarget !== null && isFinite(state._seekTarget) && !state.isPlaying) {
        audio.currentTime = state._seekTarget;
        usePlaybackStore.getState()._clearSeekTarget();
        _setCurrentTime(state._seekTarget);
      }
    });
    return unsub;
  }, [_setCurrentTime]);

  // ── Audio element event listeners (active deck) ───────────────

  useEffect(() => {
    const audio = getActiveDeck();
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

    const onDurationChange = () => setDurationSafe();
    const onCanPlay = () => {
      setDurationSafe();
      _setIsLoading(false);
    };

    const onEnded = () => {
      // During/after crossfade the transition is already handled
      if (crossfadeRef.current.active) return;
      // Ignore ended events from a stale deck (e.g. outgoing deck whose
      // src was cleared by completeCrossfade but fired before cleanup)
      if (audio !== getActiveDeck()) return;
      const endedTrack = usePlaybackStore.getState().currentTrack;
      void flushPlaybackSession();
      if (usePlaybackStore.getState().repeatMode === 'one' && endedTrack) {
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
      if (usePlaybackStore.getState().isPlaying) {
        _setIsLoading(true);
      }
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
  }, [
    currentTrack,
    _setDuration,
    _setIsLoading,
    _onTrackEnd,
    _setError,
    _setIsPlaying,
    flushPlaybackSession,
    resetPlaybackSession,
  ]);

  // ── Repeat-one: restart playback directly at Audio element level ──

  useEffect(() => {
    const audio = getActiveDeck();
    if (!audio) return;

    const onEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    };

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [repeatMode, currentTrack]);

  return deckARef;
}
