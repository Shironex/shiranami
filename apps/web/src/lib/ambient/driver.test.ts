import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AMBIENT_LEVELS, useAmbientStore } from '@/stores/useAmbientStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { AmbientDriver } from './driver';
import type { IAmbientEngine } from './engine';
import type { AmbientMode, AmbientTarget } from './target';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

const SLEEP_FADE_SECONDS = 8;

class FakeEngine implements IAmbientEngine {
  readonly targets: AmbientTarget[] = [];
  readonly graphChanged = vi.fn();
  readonly dispose = vi.fn();
  apply(target: AmbientTarget): void {
    this.targets.push(target);
  }
  get mode(): AmbientMode | undefined {
    return this.targets.at(-1)?.mode;
  }
  modesSince(index: number): AmbientMode[] {
    return this.targets.slice(index).map(t => t.mode);
  }
}

let engine: FakeEngine;
let loadEngine: ReturnType<typeof vi.fn<() => Promise<IAmbientEngine>>>;
let driver: AmbientDriver;

/** Let the driver's microtask coalescing and the engine import settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function startDriver() {
  driver = new AmbientDriver(loadEngine);
  driver.start();
  await settle();
}

describe('AmbientDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    engine = new FakeEngine();
    loadEngine = vi.fn(() => Promise.resolve<IAmbientEngine>(engine));
    useAmbientStore.setState({
      enabled: true,
      levels: { ...DEFAULT_AMBIENT_LEVELS },
      keepWhenPaused: false,
      followWeather: false,
    });
    usePlaybackStore.setState({
      isPlaying: true,
      volume: 1,
      isMuted: false,
      sleepFadeDuration: SLEEP_FADE_SECONDS,
      _sleepFading: false,
      queue: [],
      queueIndex: -1,
      currentTrack: null,
    });
    useSleepTimerStore.setState({
      endTime: null,
      duration: null,
      remaining: 0,
      windDown: false,
      stopMode: null,
    });
  });

  afterEach(() => {
    driver.stop();
    useSleepTimerStore.getState().cancel();
    vi.useRealTimers();
  });

  it('never loads the engine while ambience is off', async () => {
    useAmbientStore.setState({ enabled: false });
    await startDriver();

    usePlaybackStore.setState({ volume: 0.4 });
    await settle();

    expect(loadEngine).not.toHaveBeenCalled();
  });

  it('loads the engine on first need and plays with the music', async () => {
    await startDriver();

    expect(loadEngine).toHaveBeenCalledTimes(1);
    expect(engine.mode).toBe('play');
  });

  it('follows the music into a pause and back', async () => {
    await startDriver();

    usePlaybackStore.getState().pause();
    await settle();
    expect(engine.mode).toBe('idle');

    usePlaybackStore.getState().play();
    await settle();
    expect(engine.mode).toBe('play');
  });

  it('coalesces a burst of store writes into one engine update', async () => {
    await startDriver();
    const before = engine.targets.length;

    const { setLevel } = useAmbientStore.getState();
    setLevel('fire', 0.1);
    setLevel('fire', 0.2);
    setLevel('fire', 0.3);
    await settle();

    expect(engine.targets.length).toBe(before + 1);
    expect(engine.targets.at(-1)?.gains.fire).toBeCloseTo(0.09);
  });

  it('does not hand the engine an unchanged target on playback ticks', async () => {
    await startDriver();
    const before = engine.targets.length;

    // currentTime is written about four times a second while music plays.
    for (let i = 1; i <= 240; i++) {
      usePlaybackStore.setState({ currentTime: i * 0.25 });
      await settle();
    }

    expect(engine.targets.length).toBe(before);
  });

  describe('sleep timer coupling', () => {
    it('fades with the music, then stays off even when kept over pauses', async () => {
      useAmbientStore.setState({ keepWhenPaused: true });
      await startDriver();

      useSleepTimerStore.getState().start(1);
      vi.advanceTimersByTime(60_000);
      await settle();

      expect(usePlaybackStore.getState()._sleepFading).toBe(true);
      expect(engine.mode).toBe('sleep');
      expect(engine.targets.at(-1)?.sleepFadeSeconds).toBe(SLEEP_FADE_SECONDS);
      const fadeStart = engine.targets.length - 1;

      vi.advanceTimersByTime(SLEEP_FADE_SECONDS * 1000);
      await settle();

      expect(usePlaybackStore.getState().isPlaying).toBe(false);
      expect(engine.mode).toBe('idle');
      // The timer clears its fade flag and pauses in one tick; ambience must
      // not read that as a cancelled fade and swell back for an instant.
      expect(engine.modesSince(fadeStart)).not.toContain('play');
    });

    it('comes straight back when the timer is cancelled mid-fade', async () => {
      await startDriver();
      useSleepTimerStore.getState().start(1);
      vi.advanceTimersByTime(60_000);
      await settle();
      expect(engine.mode).toBe('sleep');

      useSleepTimerStore.getState().cancel();
      await settle();

      expect(engine.mode).toBe('play');
    });

    it('returns with the music after a sleep ending', async () => {
      useAmbientStore.setState({ keepWhenPaused: true });
      await startDriver();
      useSleepTimerStore.getState().start(1);
      vi.advanceTimersByTime(60_000 + SLEEP_FADE_SECONDS * 1000);
      await settle();
      expect(engine.mode).toBe('idle');

      usePlaybackStore.getState().play();
      await settle();

      expect(engine.mode).toBe('play');
    });

    it('fades an ambience playing over paused music when the timer runs out', async () => {
      useAmbientStore.setState({ keepWhenPaused: true });
      usePlaybackStore.setState({ isPlaying: false });
      await startDriver();
      expect(engine.mode).toBe('play');

      useSleepTimerStore.getState().start(1);
      vi.advanceTimersByTime(60_000);
      await settle();
      expect(engine.mode).toBe('sleep');

      vi.advanceTimersByTime(SLEEP_FADE_SECONDS * 1000);
      await settle();
      expect(engine.mode).toBe('idle');

      // Still asleep: an unrelated store write must not revive it.
      useAmbientStore.getState().setLevel('fire', 0.4);
      await settle();
      expect(engine.mode).toBe('idle');
    });

    it('leaves a paused-music ambience alone when the timer is cancelled early', async () => {
      useAmbientStore.setState({ keepWhenPaused: true });
      usePlaybackStore.setState({ isPlaying: false });
      await startDriver();
      useSleepTimerStore.getState().start(10);
      vi.advanceTimersByTime(60_000);

      useSleepTimerStore.getState().cancel();
      await settle();

      expect(engine.mode).toBe('play');
    });
  });

  it('lifts the rain while it rains, when following the weather', async () => {
    useAmbientStore.setState({ followWeather: true });
    await startDriver();
    const dry = engine.targets.at(-1)?.gains.rain ?? 0;

    driver.setRaining(true);
    await settle();

    expect(engine.targets.at(-1)?.gains.rain).toBeGreaterThan(dry);
  });

  it('disposes the engine when stopped', async () => {
    await startDriver();
    driver.stop();
    expect(engine.dispose).toHaveBeenCalled();
  });
});
