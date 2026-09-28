import { useEffect, useRef, useCallback } from 'react';
import { clamp01 } from '@shiranami/shared';
import {
  usePlaybackStore,
  currentTimeRef,
  type LoudnessLevelingMode,
} from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import type { Track } from '@/stores/types';
import { IS_ELECTRON } from '@/lib/platform';
import {
  initAnalyser,
  destroyAnalyser,
  setDeckGain,
  rampDeckGain,
  isAnalyserReady,
  resumeAudioContext,
  applyEqPreset,
  setEqEnabled,
  setPreampDb,
} from '@/lib/audioAnalyser';
import { useEqStore } from '@/stores/useEqStore';
import { computeLevelingGainDb, dbToLinear, type TrackLoudness } from '@/lib/loudness';
import { queryClient } from '@/lib/queryClient';
import { historyKeys } from '@/hooks/queries/useHistory';
import { isRadioTrack } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { toStreamUrl } from '@/lib/bridge/stream-urls';

/** Minimum interval (ms) between Zustand store updates for currentTime. */
const STORE_UPDATE_INTERVAL = 250;
const MIN_HISTORY_SECONDS = 30;
const MIN_HISTORY_COMPLETION_RATIO = 0.5;

/**
 * How often (ms) the playback clock ticks while playing, on top of the decks'
 * own `timeupdate` events.
 *
 * The clock used to be the animation-frame loop, which a hidden window (the
 * tray) never runs, so crossfades never started, the sleep fade stalled and
 * listening time stopped counting. `timeupdate` keeps firing for a playing
 * element whatever the page's visibility, and this interval is the backstop
 * for a deck that has stopped emitting (a stall); both engines may slow it
 * while hidden, which only delays bookkeeping, never the audible ramps (those
 * run on the audio clock, see `rampDeck`).
 */
const TICK_INTERVAL_MS = 250;

/**
 * Wall-clock slack (seconds) allowed when crediting listening time, so timer
 * jitter between two ticks cannot drop a sliver of real playback.
 */
const SESSION_TICK_SLACK_SECONDS = 0.25;

/** Samples per second of a scheduled gain curve. The audio thread interpolates between them. */
const RAMP_POINTS_PER_SECOND = 30;

type Deck = 'A' | 'B';

/**
 * The URL a deck loads for a track.
 *
 * §2.4 replaced v1's `shiranami-audio://` and `shiranami-radio://` schemes with
 * the loopback server, whose origin carries an ephemeral port and a per-session
 * token and therefore cannot be a literal. The construction moved to the bridge,
 * which is the one place that knows them; this stays the single call site it is
 * reached from, exactly as §2.4's renderer row scopes it.
 */
function getTrackSrc(track: Track): string {
  return toStreamUrl(track.filePath);
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
 * The rest of a fade as gain values: `curve` sampled from `fromProgress` to 1,
 * scaled by `scale`, dense enough for `durationSeconds`. This is what gets
 * scheduled on the audio clock. Exported for unit testing.
 */
export function sampleRamp(
  curve: (progress: number) => number,
  fromProgress: number,
  scale: number,
  durationSeconds: number
): number[] {
  const from = clamp01(fromProgress);
  const points = Math.max(2, Math.ceil(durationSeconds * RAMP_POINTS_PER_SECOND) + 1);
  const values: number[] = [];
  for (let i = 0; i < points; i++) {
    values.push(scale * curve(from + ((1 - from) * i) / (points - 1)));
  }
  return values;
}

/**
 * Listening time to credit between two clock ticks: how far the media clock
 * moved, but never more than the wall clock allows.
 *
 * The media clock is what makes this honest while the window is hidden, where
 * ticks can be seconds apart: every second of audio actually played counts.
 * The wall-clock bound is what keeps a seek forward, or a suspend and resume,
 * from minting time. Exported for unit testing.
 */
export function creditedListeningSeconds(mediaDelta: number, wallDeltaSeconds: number): number {
  if (!(mediaDelta > 0) || !(wallDeltaSeconds > 0)) return 0;
  return Math.min(mediaDelta, wallDeltaSeconds + SESSION_TICK_SLACK_SECONDS);
}

/**
 * Linear (amplitude) gain factor for loudness leveling on a single track.
 * Returns 1 (no-op) when leveling is disabled or the track's loudness is
 * unmeasured/non-finite, otherwise 10^(dB/20) for the computed ReplayGain-style
 * adjustment — mode picks track vs album reference, and the true-peak guard
 * caps boosts (see `computeLevelingGainDb`). Exported for unit testing.
 */
export function loudnessLinearGain(
  track: TrackLoudness | null,
  enabled: boolean,
  mode: LoudnessLevelingMode,
  targetLufs: number
): number {
  if (!enabled) return 1;
  const db = computeLevelingGainDb(track, mode, targetLufs);
  return dbToLinear(db);
}

/**
 * Which `play_history.source` a session belongs to.
 *
 * Only ever returns `'library'` today, because `resetPlaybackSession` refuses
 * to open a session for anything else. Written as a derivation rather than a
 * literal so that lifting that restriction is a one-line change here instead
 * of a hunt for a hardcoded string.
 */
function sourceFor(track: Track): string {
  return isRadioTrack(track.filePath) ? 'radio' : 'library';
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
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seekingRef = useRef(false);

  // Sleep-timer fade-out state. While `active`, the active deck's gain follows
  // the equal-power fadeOut curve down to silence over `duration` seconds,
  // scheduled on the audio clock (reusing the crossfade ramp).
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

  // Per-deck loudness state. `deckLufsRef` holds each deck's loaded track's
  // measured loudness surface (the source of truth — the incoming/idle deck's
  // track is not `currentTrack`, so we can't re-derive it from the store on a
  // mid-crossfade toggle). `deckLoudnessRef` caches the linear gain factor
  // applied on top of the user volume in `setVolume`. Both are set at every
  // deck-load point so each deck's track is normalized independently.
  const deckLufsRef = useRef<{ A: TrackLoudness | null; B: TrackLoudness | null }>({
    A: null,
    B: null,
  });
  const deckLoudnessRef = useRef<{ A: number; B: number }>({ A: 1, B: 1 });

  /** Recompute and cache a deck's linear loudness factor from its stored
   * loudness surface and the current loudness settings. Returns the factor. */
  function updateDeckLoudness(deck: Deck): number {
    const pb = usePlaybackStore.getState();
    const factor = loudnessLinearGain(
      deckLufsRef.current[deck],
      pb.loudnessEnabled,
      pb.loudnessLevelingMode,
      pb.loudnessTargetLufs
    );
    deckLoudnessRef.current[deck] = factor;
    return factor;
  }

  /** Store a deck's track loudness surface and refresh its cached factor,
   * logging the applied adjustment when leveling is on and a measurement
   * exists. */
  function setDeckTrackLoudness(deck: Deck, track: Track | null) {
    deckLufsRef.current[deck] = track
      ? {
          loudnessLufs: track.loudnessLufs,
          albumLoudnessLufs: track.albumLoudnessLufs,
          truePeakDb: track.truePeakDb,
        }
      : null;
    const factor = updateDeckLoudness(deck);
    const pb = usePlaybackStore.getState();
    if (pb.loudnessEnabled && track && track.loudnessLufs != null) {
      const db = computeLevelingGainDb(
        deckLufsRef.current[deck],
        pb.loudnessLevelingMode,
        pb.loudnessTargetLufs
      );
      logger.info(
        `[loudness] Deck ${deck} "${track.title}" ${track.loudnessLufs.toFixed(1)} LUFS (${pb.loudnessLevelingMode}) → ${db >= 0 ? '+' : ''}${db.toFixed(1)} dB (×${factor.toFixed(3)})`
      );
    }
  }

  // Crossfade state
  const crossfadeRef = useRef<{
    active: boolean;
    startTime: number;
    duration: number; // seconds
    outgoingDeck: Deck;
    incomingDeck: Deck;
  }>({ active: false, startTime: 0, duration: 0, outgoingDeck: 'A', incomingDeck: 'B' });

  // Near-gapless pre-buffer state. When crossfade is OFF, the next queue track
  // is pre-loaded onto the idle deck so there's no decode gap at the boundary.
  // `trackId` is the id currently pre-buffered (so we can detect a queue change
  // and discard); `deck` is the idle deck holding it.
  const preBufferRef = useRef<{ trackId: string | null; deck: Deck | null }>({
    trackId: null,
    deck: null,
  });

  // `lastTickAt` (wall clock) and `lastMediaTime` (the deck's own clock) are
  // the baseline the next tick credits listening time from; both null means
  // "not counting" (paused, buffering, between tracks).
  const playbackSessionRef = useRef<{
    track: Track | null;
    listenedSeconds: number;
    lastTickAt: number | null;
    lastMediaTime: number | null;
    recorded: boolean;
  }>({
    track: null,
    listenedSeconds: 0,
    lastTickAt: null,
    lastMediaTime: null,
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
    // Apply this deck's per-track loudness factor so each deck's track is
    // normalized independently — crucial during a crossfade where both decks
    // are audible at once.
    const gain = value * deckLoudnessRef.current[deck];
    if (isAnalyserReady()) {
      setDeckGain(deck, gain);
      // Once captured by MediaElementAudioSourceNode, volume is controlled
      // exclusively via GainNodes. However, Chromium still attenuates the
      // signal feeding into the MESN by audio.volume — if it was set to 0
      // before the analyser was initialised (e.g. idle deck on mount), the
      // MESN permanently receives silence. Keep it at 1 to avoid this.
      if (audio && audio.volume !== 1) audio.volume = 1;
    } else {
      // Pre-analyser fallback: audio.volume is clamped to [0, 1], so loudness
      // boosts above unity can't be honoured here (they take effect once the
      // GainNode chain is live on first play).
      if (audio) audio.volume = clamp01(gain);
    }
  }

  /** The volume the user asked for, respecting mute. */
  function userVolume(): number {
    const s = usePlaybackStore.getState();
    return s.isMuted ? 0 : s.volume;
  }

  /**
   * Put a deck on the rest of a fade: `curve` from `progress` to 1 over what is
   * left of `durationSeconds`, at the user's volume.
   *
   * The ramp is scheduled on the audio clock, so it runs to the end at sample
   * accuracy whether or not the page is visible. Before the Web Audio graph
   * exists (it is built on the first play) there is nothing to schedule on, and
   * the deck is set to the curve's current value instead; the clock tick keeps
   * stepping it in that case.
   */
  function rampDeck(
    deck: Deck,
    curve: (progress: number) => number,
    progress: number,
    durationSeconds: number
  ) {
    const p = clamp01(progress);
    const remaining = (1 - p) * durationSeconds;
    const vol = userVolume();
    if (
      remaining > 0 &&
      isAnalyserReady() &&
      rampDeckGain(
        deck,
        sampleRamp(curve, p, vol * deckLoudnessRef.current[deck], remaining),
        remaining
      )
    ) {
      return;
    }
    setVolume(deck, vol * curve(p));
  }

  /** How far through the running crossfade we are, 0 to 1 (and past 1 once due). */
  function crossfadeProgress(): number {
    const cf = crossfadeRef.current;
    if (cf.duration <= 0) return 1;
    return (performance.now() - cf.startTime) / 1000 / cf.duration;
  }

  /** (Re)schedule both decks' crossfade ramps from where the crossfade is now. */
  function scheduleCrossfadeRamps() {
    const cf = crossfadeRef.current;
    if (!cf.active) return;
    const progress = crossfadeProgress();
    rampDeck(cf.outgoingDeck, fadeOut, progress, cf.duration);
    rampDeck(cf.incomingDeck, fadeIn, progress, cf.duration);
  }

  /** (Re)schedule the sleep fade on the active deck from where it is now. */
  function scheduleSleepFade() {
    const sf = sleepFadeRef.current;
    if (!sf.active) return;
    const progress = (performance.now() - sf.startTime) / (sf.duration * 1000);
    rampDeck(activeDeckRef.current, fadeOut, progress, sf.duration);
  }

  /**
   * Start the sleep fade if the sleep timer has asked for one. Deferred while a
   * crossfade owns the deck gains; `completeCrossfade` calls this again.
   */
  function maybeStartSleepFade() {
    const s = usePlaybackStore.getState();
    const sf = sleepFadeRef.current;
    if (!s._sleepFading || sf.active || crossfadeRef.current.active || !s.isPlaying) return;
    sf.active = true;
    sf.startTime = performance.now();
    sf.duration = Math.max(0.1, s.sleepFadeDuration);
    scheduleSleepFade();
  }

  /**
   * Apply the user's volume to the active deck, unless a fade owns it: then the
   * fade is rescheduled at the new volume, as the per-frame loop used to do by
   * recomputing every frame.
   */
  function applyActiveVolume() {
    if (crossfadeRef.current.active) {
      scheduleCrossfadeRamps();
      return;
    }
    if (sleepFadeRef.current.active) {
      scheduleSleepFade();
      return;
    }
    setVolume(activeDeckRef.current, userVolume());
  }

  /** Re-baseline the listening clock on `audio` (or stop it when null). */
  function markSessionClock(audio: HTMLAudioElement | null) {
    const session = playbackSessionRef.current;
    session.lastTickAt = audio ? performance.now() : null;
    session.lastMediaTime = audio ? audio.currentTime : null;
  }

  // ── Preamp gain (EQ preamp only) ──────────────────────────────
  //
  // The preamp GainNode now carries only the EQ preamp slider. Loudness leveling
  // rides each deck's own gain (see setVolume / deckLoudnessRef) so it survives a
  // crossfade — both decks can be normalized independently. Call this on EQ
  // preamp change.
  const recomputePreamp = useCallback(() => {
    if (!analyserInitRef.current) return;
    setPreampDb(useEqStore.getState().preampDb);
  }, []);

  // ── Playback session (listening history) ──────────────────────

  /**
   * Radio is deliberately excluded from `play_history`, and this is the only
   * place that decision is made.
   *
   * It is a schema constraint, not a policy: `play_history.track_id` is
   * `NOT NULL REFERENCES tracks(id) ON DELETE CASCADE`
   * (`crates/shiranami-db/migrations/0001_baseline.sql`), and both engines
   * enforce it — `pool.rs`'s `.foreign_keys(true)` and `client.ts`'s
   * `pragma foreign_keys = ON`. A radio track's id is `radio:<station-uuid>`,
   * minted by `stationToTrack` for the queue and never written to `tracks`, so
   * an insert for one cannot succeed. Recording radio here would not be a
   * feature that works differently; it would be a `FOREIGN KEY constraint
   * failed` on every station, swallowed by the catch in `flushPlaybackSession`
   * and visible as nothing at all.
   *
   * Radio listening belongs in a table that does not reference `tracks`. Until
   * that lands, a radio session simply is not a session — hence `track: null`,
   * which makes `flushPlaybackSession` return before it can build a row.
   *
   * The seam for enabling it is `recordPlay`'s `source` argument, which
   * `flushPlaybackSession` now passes explicitly: `'library'` here, `'radio'`
   * for the radio path when there is somewhere for it to go.
   */
  const resetPlaybackSession = useCallback((track: Track | null) => {
    playbackSessionRef.current = {
      track: track && !isRadioTrack(track.filePath) ? track : null,
      listenedSeconds: 0,
      lastTickAt: null,
      lastMediaTime: null,
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
    session.lastMediaTime = null;

    if (!track || !shouldRecord) return;

    session.recorded = true;

    try {
      await window.electronAPI.db.history.recordPlay({
        trackId: track.id,
        playedSeconds,
        duration,
        // Explicit rather than relying on the handler's default, so the
        // 'library' / 'radio' contract in `packages/contracts/src/ipc/history.ts`
        // has a real caller. Every session that reaches here is a library one
        // by construction — see `resetPlaybackSession` for why radio cannot be.
        source: sourceFor(track),
      });
      incrementTrackPlayCount(track.id);
      queryClient.invalidateQueries({ queryKey: historyKeys.all });
    } catch {
      session.recorded = false;
    }
  }, [incrementTrackPlayCount]);

  // ── Near-gapless pre-buffer helpers ───────────────────────────

  /** Determine the next-up track given the current queue/repeat state, or null
   * when there is no eligible (non-radio) next track. */
  function getNextQueueTrack(): Track | null {
    const { queue, queueIndex, repeatMode: rm } = usePlaybackStore.getState();
    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      if (rm === 'all') nextIndex = 0;
      else return null;
    }
    const next = queue[nextIndex];
    if (!next || isRadioTrack(next.filePath)) return null;
    return next;
  }

  /** Discard any pre-buffered track on the idle deck and reset the ref. Safe to
   * call when nothing is pre-buffered. Never touches the active deck. */
  const discardPreBuffer = useCallback(() => {
    const pb = preBufferRef.current;
    if (!pb.trackId || !pb.deck) return;
    // Only clear if this deck is still idle and still holds the pre-buffered
    // track — never disturb a deck that has since become active.
    if (pb.deck !== activeDeckRef.current && deckTrackIdRef.current[pb.deck] === pb.trackId) {
      const idle = getDeck(pb.deck);
      if (idle) {
        idle.pause();
        idle.src = '';
      }
      deckTrackIdRef.current[pb.deck] = null;
    }
    preBufferRef.current = { trackId: null, deck: null };
  }, []);

  /** Pre-load the next queue track onto the idle deck (decode-ahead) so the
   * transition at the track boundary is gap-free. No-op while crossfade is
   * active/enabled, for radio, or repeat-one. Discards a stale pre-buffer if the
   * upcoming track changed. */
  const maybePreBuffer = useCallback(() => {
    if (crossfadeRef.current.active) return;
    const state = usePlaybackStore.getState();
    if (state.crossfadeEnabled || state.repeatMode === 'one') {
      discardPreBuffer();
      return;
    }

    const next = getNextQueueTrack();
    if (!next) {
      discardPreBuffer();
      return;
    }

    // Already pre-buffered the right track — nothing to do.
    if (preBufferRef.current.trackId === next.id) return;

    // The upcoming track changed — discard the old pre-buffer first.
    discardPreBuffer();

    const idleDeckId = getIdleDeckId();
    const idleAudio = getIdleDeck();
    if (!idleAudio) return;

    idleAudio.src = getTrackSrc(next);
    idleAudio.load();
    deckTrackIdRef.current[idleDeckId] = next.id;
    // Pre-normalize the pre-buffered deck so its gain is already correct when it
    // becomes active at the (gap-free) track boundary.
    setDeckTrackLoudness(idleDeckId, next);
    preBufferRef.current = { trackId: next.id, deck: idleDeckId };
  }, [discardPreBuffer]);

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
    // The outgoing deck was mid-ramp on the audio clock; a plain set cancels
    // the rest of it so it does not keep fading out under the next track.
    setVolume(cf.outgoingDeck, userVolume());
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

    // An armed sleep-timer boundary stop means this track must end naturally —
    // no early crossfade into a track that won't play.
    if (useSleepTimerStore.getState().stopsAtBoundary()) return;

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
    // Normalize the incoming deck to its own track before its ramp is
    // scheduled, since the ramp is scaled by that factor.
    setDeckTrackLoudness(incomingDeckId, nextTrack);

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
    // A crossfade takes the deck gains over from a running sleep fade, which
    // ends here. The rule is the old frame loop's, and it keeps one invariant:
    // the sleep fade is never active while a crossfade is. If the timer is
    // still fading when the crossfade completes, `completeCrossfade` starts a
    // fresh fade on the new deck.
    sleepFadeRef.current.active = false;
    // Both ramps run on the audio clock from here, so the crossfade completes
    // on time even with the window hidden to the tray.
    scheduleCrossfadeRamps();

    const onCanPlay = () => {
      incomingAudio.removeEventListener('canplay', onCanPlay);
      if (!crossfadeRef.current.active) return;
      resumeAudioContext();
      // Re-sync the incoming ramp to where the crossfade is now: the deck may
      // have taken a moment to buffer.
      scheduleCrossfadeRamps();
      incomingAudio.play().catch(err => {
        if (err?.name !== 'AbortError') logger.error('[audio] play() rejected', err);
      });
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
        incoming.play().catch(err => {
          if (err?.name !== 'AbortError') logger.error('[audio] play() rejected', err);
        });
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

    // A sleep fade that arrived mid-crossfade waited for the decks to settle.
    maybeStartSleepFade();
  }, [resetPlaybackSession, _setDuration, _setIsLoading]);

  // ── Initialization ────────────────────────────────────────────

  useEffect(() => {
    if (!deckARef.current) {
      deckARef.current = new Audio();
      deckARef.current.preload = 'auto';
      // Required so MediaElementAudioSourceNode receives actual samples;
      // without it Web Audio outputs silent zeroes for cross-origin sources.
      // The loopback server answers every media route with
      // `Access-Control-Allow-Origin: *` (§2.4, Spike A) precisely so this
      // holds — a missing header here is a silent player, not an error.
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
      if (tickIntervalRef.current !== null) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [_setIsLoading, flushPlaybackSession]);

  // ── Playback clock (with crossfade monitoring) ────────────────

  /**
   * Everything that has to happen while playing, in time: listening time,
   * the store's position, starting and finishing crossfades, the sleep fade
   * and the gapless pre-buffer.
   *
   * Driven by the decks' `timeupdate` events and a `TICK_INTERVAL_MS` interval,
   * never by animation frames: a window hidden to the tray runs none, and this
   * is the part of playback that has to keep going there. The audible ramps are
   * not stepped here; they are scheduled once on the audio clock (`rampDeck`).
   */
  const tick = useCallback(() => {
    if (!usePlaybackStore.getState().isPlaying) return;
    const audio = getActiveDeck();
    if (!audio) return;

    if (!seekingRef.current) {
      // Accumulate listening time from the media clock, bounded by the wall
      // clock (see `creditedListeningSeconds`).
      const session = playbackSessionRef.current;
      const tickNow = performance.now();
      const canAccumulate =
        session.track &&
        !audio.paused &&
        !audio.ended &&
        !audio.seeking &&
        audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

      if (canAccumulate) {
        if (session.lastTickAt !== null && session.lastMediaTime !== null) {
          session.listenedSeconds += creditedListeningSeconds(
            audio.currentTime - session.lastMediaTime,
            (tickNow - session.lastTickAt) / 1000
          );
        }
        markSessionClock(audio);
      } else if (session.track) {
        markSessionClock(audio);
      }

      currentTimeRef.current = audio.currentTime;

      if (tickNow - lastStoreUpdateRef.current >= STORE_UPDATE_INTERVAL) {
        lastStoreUpdateRef.current = tickNow;
        _setCurrentTime(audio.currentTime);
      }
    }

    // ── Sleep-timer fade-out ──
    // Normally started by the `_sleepFading` subscription; checked here too so a
    // fade deferred behind a crossfade can never be missed.
    maybeStartSleepFade();

    // ── Crossfade monitoring ──
    const cf = crossfadeRef.current;
    const state = usePlaybackStore.getState();

    if (cf.active) {
      const progress = crossfadeProgress();
      if (!isAnalyserReady()) {
        // No audio clock to schedule on yet: step the volumes per tick.
        const userVol = userVolume();
        setVolume(cf.outgoingDeck, userVol * fadeOut(clamp01(progress)));
        setVolume(cf.incomingDeck, userVol * fadeIn(clamp01(progress)));
      }
      if (progress >= 1) {
        completeCrossfade();
      }
    } else if (
      state.crossfadeEnabled &&
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
    } else if (!isRadioTrack(state.currentTrack?.filePath ?? '')) {
      // ── Near-gapless pre-buffer (crossfade OFF) ──
      // Once we're a few seconds from the end, decode-ahead the next queue
      // track onto the idle deck. Cheap + idempotent: maybePreBuffer no-ops
      // when the right track is already buffered.
      const dur = audio.duration;
      if (isFinite(dur) && dur > 0 && dur - audio.currentTime <= 30) {
        maybePreBuffer();
      }
    }
  }, [_setCurrentTime, completeCrossfade, startCrossfade, maybePreBuffer]);

  // The listeners below outlive any one `tick`, so they call the latest one.
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  /**
   * The seek bar's smooth position while the window is visible: the only job
   * animation frames still have. It decides nothing, so a hidden window that
   * runs no frames loses nothing but the smoothness nobody can see.
   */
  const visualFrame = useCallback(() => {
    const audio = getActiveDeck();
    if (audio && !seekingRef.current) currentTimeRef.current = audio.currentTime;
    if (usePlaybackStore.getState().isPlaying) {
      animationFrameRef.current = requestAnimationFrame(visualFrame);
    }
  }, []);

  /** Start (or restart) the playback clock and the visual loop. */
  const startClock = useCallback(() => {
    if (tickIntervalRef.current !== null) clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = setInterval(() => tickRef.current(), TICK_INTERVAL_MS);
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(visualFrame);
  }, [visualFrame]);

  /** Stop the playback clock and the visual loop. */
  const stopClock = useCallback(() => {
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    cancelAnimationFrame(animationFrameRef.current);
  }, []);

  // Both decks drive the clock: the active one always, and the incoming one
  // during a crossfade, whose ramp ends while the outgoing deck may already be
  // silent and done.
  useEffect(() => {
    const decks = [deckARef.current, deckBRef.current].filter(
      (deck): deck is HTMLAudioElement => deck !== null
    );
    const onTimeUpdate = () => tickRef.current();
    for (const deck of decks) deck.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      for (const deck of decks) deck.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, []);

  // The sleep timer raises `_sleepFading` for the fade and lowers it when the
  // fade ends. Reacting to the flag, rather than polling it per frame, is what
  // lets the fade start in a hidden window.
  useEffect(() => {
    return usePlaybackStore.subscribe((state, prev) => {
      if (state._sleepFading === prev._sleepFading) return;
      if (state._sleepFading) {
        maybeStartSleepFade();
        return;
      }
      // Lowered: the sleep timer lowers the flag and pauses in the same
      // breath, and on that path the pause branch of the play effect restores
      // the volume once the deck is silent. Restoring here instead would put
      // the full volume back for a moment before the pause. So wait a
      // microtask, and restore only if playback is still going (the timer was
      // cancelled mid-fade). The fade itself always ends here, whatever
      // happens to the volume.
      queueMicrotask(() => {
        const sf = sleepFadeRef.current;
        if (!sf.active) return;
        if (!usePlaybackStore.getState().isPlaying) return;
        sf.active = false;
        if (!crossfadeRef.current.active) setVolume(activeDeckRef.current, userVolume());
      });
    });
  }, []);

  // ── Load track when currentTrack changes ──────────────────────

  useEffect(() => {
    const audio = getActiveDeck();
    if (!audio) return;

    if (!currentTrack) {
      cancelCrossfade();
      discardPreBuffer();
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

    // If loaded on the idle deck, swap to it. This covers two cases: a crossfade
    // advanced the store, OR the near-gapless pre-buffer decoded the next track
    // ahead of time. In the pre-buffer case the deck is paused at 0 with gain 0
    // (idle), so restore the user volume and reset the session; the play effect
    // resumes + plays it.
    const idleDeckId = getIdleDeckId();
    if (deckTrackIdRef.current[idleDeckId] === currentTrack.id) {
      const wasPreBuffered = preBufferRef.current.trackId === currentTrack.id;
      activeDeckRef.current = idleDeckId;
      preBufferRef.current = { trackId: null, deck: null };
      if (wasPreBuffered) {
        const s = usePlaybackStore.getState();
        setVolume(idleDeckId, s.isMuted ? 0 : s.volume);
        setVolume(getIdleDeckId(), 0);
        // Stop the previously-active deck so a manual skip to the pre-buffered
        // track doesn't leave the old track playing silently in the background
        // (and decoding) until the next maybePreBuffer overwrites its src.
        getDeck(getIdleDeckId())?.pause();
        const incoming = getDeck(idleDeckId);
        if (incoming && incoming.currentTime > 0.5) incoming.currentTime = 0;
        void flushPlaybackSession();
        resetPlaybackSession(currentTrack);
        // The pre-buffered deck was `.load()`-ed but never played, and the
        // play/pause sync effect does NOT re-run on a currentTrack change
        // (isPlaying is unchanged). Start it here so playback continues
        // gaplessly across the boundary. (The crossfade-advanced swap doesn't
        // need this — completeCrossfade already played the incoming deck.)
        if (incoming && s.isPlaying) {
          resumeAudioContext();
          incoming.play().catch(err => {
            if (err.name !== 'AbortError') {
              logger.error('[audio] play() rejected', err);
              _setError(err.message);
              _setIsPlaying(false);
            }
          });
          // NOTE: do not restart the clock here. The play/pause sync effect
          // already started it, and it keeps running across the boundary.
        }
      }
      _setIsLoading(false);
      return;
    }

    // Cancel any in-progress crossfade (manual skip)
    cancelCrossfade();
    // A manual skip to a different track invalidates any pre-buffer.
    discardPreBuffer();

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
            logger.error('[audio] play() rejected', err);
            _setError(err.message);
            _setIsPlaying(false);
          }
        });
        startClock();
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
    startClock,
    flushPlaybackSession,
    resetPlaybackSession,
    discardPreBuffer,
  ]);

  // ── Sync play / pause ─────────────────────────────────────────

  useEffect(() => {
    const active = getActiveDeck();
    if (!active || !active.src) return;

    if (isPlaying) {
      markSessionClock(active);

      // Lazily initialise the Web Audio analyser on first play
      if (!analyserInitRef.current && deckARef.current && deckBRef.current) {
        try {
          initAnalyser(deckARef.current, deckBRef.current);
          analyserInitRef.current = true;
          // Set initial gains via setVolume so the active deck's cached
          // loudness factor is applied from the very first play.
          const userVol = isMuted ? 0 : volume;
          setVolume(activeDeckRef.current, userVol);
          setVolume(getIdleDeckId(), 0);

          // Replay the persisted EQ state into the chain. The biquads are only
          // built (and wired) when the user actually has the EQ on, so a
          // default (disabled) install never pays for them on the audio thread.
          const eq = useEqStore.getState();
          recomputePreamp();
          if (eq.enabled) {
            setEqEnabled(true);
            applyEqPreset(eq.gains);
          }
        } catch {
          // Non-critical - visualiser just won't work
        }
      }

      resumeAudioContext();
      active.play().catch((err: DOMException) => {
        if (err.name !== 'AbortError') {
          logger.error('[audio] play() rejected', err);
          _setError(err.message);
          _setIsPlaying(false);
        }
      });

      // Also resume incoming deck if crossfading
      if (crossfadeRef.current.active) {
        const incoming = getDeck(crossfadeRef.current.incomingDeck);
        incoming?.play().catch(err => {
          if (err?.name !== 'AbortError') logger.error('[audio] play() rejected', err);
        });
      }

      startClock();
    } else {
      markSessionClock(null);
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
      // A pause ends the fade whatever else is going on; only the volume
      // restore waits while a crossfade owns the gains (its completion sets
      // them).
      if (sleepFadeRef.current.active || usePlaybackStore.getState()._sleepFading) {
        const wasFading = sleepFadeRef.current.active;
        sleepFadeRef.current.active = false;
        if (wasFading && !crossfadeRef.current.active) {
          setVolume(activeDeckRef.current, isMuted ? 0 : volume);
        }
        // A manual pause mid-fade abandons the fade entirely — clear the
        // store signal so resuming doesn't re-trigger the ramp. (When the
        // fade completes naturally the sleep-timer store has already cleared
        // this, so this only matters for the manual-pause path, including a
        // fade that was waiting behind a crossfade.)
        if (usePlaybackStore.getState()._sleepFading) {
          usePlaybackStore.getState()._setSleepFading(false);
        }
      }
      stopClock();
    }
  }, [
    isPlaying,
    startClock,
    stopClock,
    _setError,
    _setIsPlaying,
    _setIsLoading,
    volume,
    isMuted,
    recomputePreamp,
  ]);

  // ── Sync volume ───────────────────────────────────────────────

  useEffect(() => {
    // During a crossfade or the sleep fade the ramps own the gains; they are
    // rescheduled at the new volume instead of being overwritten.
    applyActiveVolume();
    if (!crossfadeRef.current.active) setVolume(getIdleDeckId(), 0);
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
        // setEqEnabled owns the dry/wet crossfade (and builds the filters on
        // the first enable); the preset re-apply then fills a fresh chain in.
        setEqEnabled(state.enabled);
        if (state.enabled) {
          applyEqPreset(state.gains);
        }
      } else if (state.enabled && state.gains !== prev.gains) {
        applyEqPreset(state.gains);
      }

      if (state.preampDb !== prev.preampDb) {
        recomputePreamp();
      }

      prev = state;
    });
    return unsub;
  }, [recomputePreamp]);

  // ── Loudness leveling: refresh the active deck's factor when the current
  // track changes. This single effect covers a normal track load, the
  // pre-buffer swap, and the crossfade-complete swap, because by the time it
  // runs `activeDeckRef` already points at the deck holding `currentTrack`
  // (the load effect above reassigns it first). The incoming/idle deck's factor
  // is set inline at startCrossfade / maybePreBuffer.
  useEffect(() => {
    setDeckTrackLoudness(activeDeckRef.current, currentTrack ?? null);
    // Re-apply the active deck's volume so the new factor actually reaches the
    // gain node. The volume-sync effect runs BEFORE this one (it also depends on
    // currentTrack) using the previous track's still-cached factor, and nothing
    // else calls setVolume during steady playback — so without this a manual
    // skip / normal load would keep the old track's loudness. During a fade the
    // fade is rescheduled with the new factor instead.
    applyActiveVolume();
  }, [currentTrack]);

  // React to loudness toggle / target changes only (the store fires on every
  // currentTime tick, so guard on the loudness fields to avoid recomputing every
  // frame). Loudness now rides each deck's gain, so recompute BOTH deck factors
  // and re-apply the active deck's volume immediately (respecting mute) so the
  // change is audible without waiting for a track change. Mid-fade, the fade is
  // rescheduled with the new factors.
  useEffect(() => {
    let prevEnabled = usePlaybackStore.getState().loudnessEnabled;
    let prevTarget = usePlaybackStore.getState().loudnessTargetLufs;
    let prevMode = usePlaybackStore.getState().loudnessLevelingMode;
    const unsub = usePlaybackStore.subscribe(state => {
      if (
        state.loudnessEnabled === prevEnabled &&
        state.loudnessTargetLufs === prevTarget &&
        state.loudnessLevelingMode === prevMode
      ) {
        return;
      }
      prevEnabled = state.loudnessEnabled;
      prevTarget = state.loudnessTargetLufs;
      prevMode = state.loudnessLevelingMode;
      updateDeckLoudness('A');
      updateDeckLoudness('B');
      applyActiveVolume();
    });
    return unsub;
  }, []);

  // ── Handle seeks ──────────────────────────────────────────────
  //
  // Applied as soon as the store asks, playing or paused. The per-frame loop
  // used to pick up a seek while playing, which a hidden window never ran.

  useEffect(() => {
    const unsub = usePlaybackStore.subscribe(state => {
      const audio = getActiveDeck();
      if (!audio || state._seekTarget === null || !isFinite(state._seekTarget)) return;
      const target = state._seekTarget;
      audio.currentTime = target;
      usePlaybackStore.getState()._clearSeekTarget();
      if (!state.isPlaying) {
        _setCurrentTime(target);
        return;
      }
      seekingRef.current = true;
      markSessionClock(audio);
      setTimeout(() => {
        seekingRef.current = false;
      }, 300);
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
      // An armed sleep-timer boundary stop (end of track / end of album)
      // fires here: pause instead of advancing, leaving the queue where the
      // listener drifted off — the same resting state as a queue running out.
      const sleepTimer = useSleepTimerStore.getState();
      if (sleepTimer.stopsAtBoundary()) {
        sleepTimer.completeBoundaryStop();
        return;
      }
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
      markSessionClock(null);
      if (usePlaybackStore.getState().isPlaying) {
        _setIsLoading(true);
      }
    };
    const onPlaying = () => {
      markSessionClock(audio);
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
        // A sleep-timer boundary stop wins over the repeat loop. Checked on
        // live store state so the outcome is the same whichever 'ended'
        // listener runs first: before the stop fires `stopsAtBoundary` is
        // true; after it fires the store is already paused.
        const sleepTimer = useSleepTimerStore.getState();
        if (sleepTimer.stopsAtBoundary()) return;
        if (!usePlaybackStore.getState().isPlaying) return;
        audio.currentTime = 0;
        audio.play().catch(err => {
          if (err?.name !== 'AbortError') logger.error('[audio] play() rejected', err);
        });
      }
    };

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [repeatMode, currentTrack]);

  return deckARef;
}
