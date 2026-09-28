/**
 * Glue between the stores and the (lazily loaded) ambience engine.
 *
 * The driver lives in the main bundle and is tiny: it watches the ambience,
 * playback and sleep-timer stores, reduces them to an `AmbientTarget`
 * (`target.ts`) and hands that to the engine. The engine chunk is only
 * imported the first time a target is not idle, so an install that never
 * turns ambience on never downloads, parses or runs any of it.
 *
 * Store changes are coalesced to one evaluation per microtask. That matters
 * for the sleep timer: when its fade completes it clears `_sleepFading` and
 * pauses in the same tick, and evaluating between the two would read as "fade
 * cancelled, bring the ambience back up" for an instant.
 */

import { subscribeAudioGraph } from '@/lib/audioAnalyser';
import { logger } from '@/lib/logger';
import { AMBIENT_LAYER_IDS, useAmbientStore } from '@/stores/useAmbientStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import type { IAmbientEngine } from './engine';
import {
  computeAmbientTarget,
  nextSleptOut,
  type AmbientTarget,
  type SleepSnapshot,
} from './target';

export type EngineLoader = () => Promise<IAmbientEngine>;

const loadEngineChunk: EngineLoader = () =>
  import('./engine').then(module => module.createAmbientEngine());

/**
 * How close to the timer's deadline its `endTime` must be when it clears for
 * that to count as the timer running out rather than being cancelled. The
 * store ticks once a second, so an expiry clears within about a second of
 * the deadline and a cancel almost always well before it.
 */
const EXPIRY_WINDOW_MS = 1500;

export class AmbientDriver {
  private engine: IAmbientEngine | null = null;
  private engineLoading: Promise<void> | null = null;
  private unsubscribers: Array<() => void> = [];
  private scheduled = false;
  private raining = false;
  private sleptOut = false;
  private pausedSleepFading = false;
  private pausedSleepTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSleep: SleepSnapshot = { isPlaying: false, sleepFading: false };
  /** A sleep fade was running at some store write since the last evaluation. */
  private sleepFadeSeen = false;
  private lastTarget: AmbientTarget | null = null;
  private running = false;

  constructor(private readonly loadEngine: EngineLoader = loadEngineChunk) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const playback = usePlaybackStore.getState();
    this.lastSleep = { isPlaying: playback.isPlaying, sleepFading: playback._sleepFading };
    this.unsubscribers = [
      useAmbientStore.subscribe(() => this.schedule()),
      usePlaybackStore.subscribe((next, prev) => {
        // Recorded per write, not per evaluation, so a fade that starts and
        // ends between two evaluations still latches the sleep ending.
        if (next._sleepFading || prev._sleepFading) this.sleepFadeSeen = true;
        this.schedule();
      }),
      useSleepTimerStore.subscribe((next, prev) => this.onSleepTimer(next.endTime, prev.endTime)),
      subscribeAudioGraph(() => {
        this.engine?.graphChanged();
        this.schedule();
      }),
    ];
    this.schedule();
  }

  stop(): void {
    this.running = false;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.clearPausedSleepFade();
    this.engine?.dispose();
    this.engine = null;
    this.lastTarget = null;
  }

  /** From the weather hook: whether it is raining where the listener is. */
  setRaining(raining: boolean): void {
    if (this.raining === raining) return;
    this.raining = raining;
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || !this.running) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.running) this.evaluate();
    });
  }

  /**
   * A timed sleep timer running out over paused music never raises
   * `_sleepFading` (the store only fades what is playing), so an ambience
   * kept on over the pause would play on through the night. Catch that
   * expiry here and give the ambience the fade the music would have had.
   */
  private onSleepTimer(endTime: number | null, prevEndTime: number | null): void {
    if (prevEndTime === null || endTime !== null) return;
    const expired = Date.now() >= prevEndTime - EXPIRY_WINDOW_MS;
    if (!expired || usePlaybackStore.getState().isPlaying) return;
    if (this.lastTarget?.mode !== 'play') return;

    this.pausedSleepFading = true;
    const seconds = usePlaybackStore.getState().sleepFadeDuration;
    this.pausedSleepTimer = setTimeout(() => {
      this.pausedSleepTimer = null;
      this.pausedSleepFading = false;
      this.sleptOut = true;
      this.schedule();
    }, seconds * 1000);
    this.schedule();
  }

  private clearPausedSleepFade(): void {
    if (this.pausedSleepTimer !== null) clearTimeout(this.pausedSleepTimer);
    this.pausedSleepTimer = null;
    this.pausedSleepFading = false;
  }

  private evaluate(): void {
    const ambient = useAmbientStore.getState();
    const playback = usePlaybackStore.getState();

    const sleep: SleepSnapshot = {
      isPlaying: playback.isPlaying,
      sleepFading: playback._sleepFading,
    };
    const prev: SleepSnapshot = {
      isPlaying: this.lastSleep.isPlaying,
      sleepFading: this.lastSleep.sleepFading || this.sleepFadeSeen,
    };
    this.sleptOut = nextSleptOut(prev, sleep, this.sleptOut);
    this.lastSleep = sleep;
    this.sleepFadeSeen = false;
    if (sleep.isPlaying) this.clearPausedSleepFade();

    const target = computeAmbientTarget({
      enabled: ambient.enabled,
      levels: ambient.levels,
      keepWhenPaused: ambient.keepWhenPaused,
      followWeather: ambient.followWeather,
      raining: this.raining,
      isPlaying: playback.isPlaying,
      volume: playback.volume,
      isMuted: playback.isMuted,
      sleepFading: playback._sleepFading,
      pausedSleepFading: this.pausedSleepFading,
      sleptOut: this.sleptOut,
      sleepFadeSeconds: playback.sleepFadeDuration,
    });
    const unchanged = this.lastTarget !== null && sameTarget(this.lastTarget, target);
    this.lastTarget = target;

    if (this.engine) {
      // Most store writes are playback ticks (currentTime, ~4 Hz) that change
      // nothing here; the engine only hears about real changes.
      if (!unchanged) this.engine.apply(target);
      return;
    }
    if (target.mode === 'idle' || this.engineLoading) return;
    this.engineLoading = this.loadEngine()
      .then(engine => {
        this.engineLoading = null;
        if (!this.running) {
          engine.dispose();
          return;
        }
        this.engine = engine;
        if (this.lastTarget) engine.apply(this.lastTarget);
      })
      .catch((error: unknown) => {
        this.engineLoading = null;
        logger.warn('[ambience] engine failed to load', error);
      });
  }
}

function sameTarget(a: AmbientTarget, b: AmbientTarget): boolean {
  return (
    a.mode === b.mode &&
    a.sleepFadeSeconds === b.sleepFadeSeconds &&
    a.keepBuffers === b.keepBuffers &&
    AMBIENT_LAYER_IDS.every(id => a.gains[id] === b.gains[id])
  );
}

let shared: AmbientDriver | null = null;

/** The app-wide driver (one AudioContext, one ambience). */
export function getAmbientDriver(): AmbientDriver {
  shared ??= new AmbientDriver();
  return shared;
}
