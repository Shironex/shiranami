import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import {
  creditedListeningSeconds,
  fadeIn,
  fadeOut,
  sampleRamp,
  useAudioEngine,
} from './useAudioEngine';

/**
 * The engine's clock with the window hidden to the tray: animation frames never
 * fire. Everything that has to keep happening (crossfades, the sleep fade,
 * listening time) is asserted with `requestAnimationFrame` stubbed to a no-op,
 * the decks' own media clocks advancing in (fake) real time, and the Web Audio
 * graph replaced by a recorder of the ramps scheduled on it.
 */

const graph = vi.hoisted(() => ({
  ramps: [] as Array<{ deck: 'A' | 'B'; values: number[]; duration: number }>,
  gains: [] as Array<{ deck: 'A' | 'B'; value: number }>,
  /** Every gain decision in order: a plain set, or a ramp and where it ends. */
  last: { A: null, B: null } as Record<'A' | 'B', number | null>,
}));

vi.mock('@/lib/audioAnalyser', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/audioAnalyser')>()),
  initAnalyser: vi.fn(),
  destroyAnalyser: vi.fn(),
  setDeckGain: vi.fn((deck: 'A' | 'B', value: number) => {
    graph.gains.push({ deck, value });
    graph.last[deck] = value;
  }),
  rampDeckGain: vi.fn((deck: 'A' | 'B', values: readonly number[], duration: number) => {
    graph.ramps.push({ deck, values: [...values], duration });
    graph.last[deck] = values.at(-1) ?? null;
    return true;
  }),
  isAnalyserReady: () => true,
  resumeAudioContext: vi.fn(),
  applyEqPreset: vi.fn(),
  setEqEnabled: vi.fn(),
  setPreampDb: vi.fn(),
}));

vi.mock('@/lib/bridge/stream-urls', () => ({
  toStreamUrl: (filePath: string) => `http://127.0.0.1:1/audio${filePath}`,
}));

const TRACK_SECONDS = 200;

/**
 * An `<audio>` whose clock runs while it plays, the way a real one keeps
 * playing (and keeps its `currentTime` moving) in a hidden window.
 */
class FakeAudio extends EventTarget {
  static decks: FakeAudio[] = [];

  src = '';
  preload = '';
  crossOrigin: string | null = null;
  volume = 1;
  duration = Number.NaN;
  readyState = 0;
  paused = true;
  ended = false;
  seeking = false;
  error = null;
  private offset = 0;
  private since = 0;

  constructor() {
    super();
    FakeAudio.decks.push(this);
  }

  get currentTime(): number {
    return this.paused ? this.offset : this.offset + (performance.now() - this.since) / 1000;
  }

  set currentTime(value: number) {
    this.offset = value;
    this.since = performance.now();
  }

  load(): void {
    if (!this.src) return;
    this.readyState = 4;
    this.duration = TRACK_SECONDS;
    this.currentTime = 0;
  }

  play(): Promise<void> {
    if (this.paused) {
      this.since = performance.now();
      this.paused = false;
    }
    return Promise.resolve();
  }

  pause(): void {
    if (!this.paused) {
      this.offset = this.currentTime;
      this.paused = true;
    }
  }
}

function track(id: string): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Yumemi',
    album: 'Lofi',
    filePath: `/music/${id}.mp3`,
    duration: TRACK_SECONDS,
    loudnessLufs: null,
    albumLoudnessLufs: null,
    truePeakDb: null,
  } as unknown as Track;
}

const initialState = usePlaybackStore.getState();

function play(tracks: Track[], extra: Partial<ReturnType<typeof usePlaybackStore.getState>> = {}) {
  usePlaybackStore.setState({
    queue: tracks,
    queueIndex: 0,
    currentTrack: tracks[0],
    isPlaying: true,
    volume: 0.8,
    isMuted: false,
    repeatMode: 'off',
    loudnessEnabled: false,
    ...extra,
  });
}

/** Let `ms` of wall time pass, ticking the clock the way the interval does. */
function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'],
  });
  FakeAudio.decks = [];
  graph.ramps = [];
  graph.gains = [];
  graph.last = { A: null, B: null };
  vi.stubGlobal('Audio', FakeAudio);
  // A hidden window: frames are requested and never delivered.
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  usePlaybackStore.setState(initialState, true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  usePlaybackStore.setState(initialState, true);
});

describe('the playback clock with no animation frames', () => {
  it('starts a crossfade on time and completes it', () => {
    const [first, second] = [track('a'), track('b')];
    play([first, second], { crossfadeEnabled: true, crossfadeDuration: 4 });
    renderHook(() => useAudioEngine());
    const [deckA, deckB] = FakeAudio.decks;
    expect(deckA.paused).toBe(false);

    // Five seconds from the end: one second before the crossfade window.
    act(() => {
      deckA.currentTime = TRACK_SECONDS - 5;
    });
    elapse(500);
    expect(graph.ramps).toHaveLength(0);

    elapse(1000);
    const outgoing = graph.ramps.filter(ramp => ramp.deck === 'A').at(-1);
    const incoming = graph.ramps.filter(ramp => ramp.deck === 'B').at(-1);
    expect(outgoing, 'the outgoing deck is ramped down on the audio clock').toBeDefined();
    expect(incoming, 'the incoming deck is ramped up on the audio clock').toBeDefined();
    expect(outgoing!.values.at(0)).toBeCloseTo(0.8, 2);
    expect(outgoing!.values.at(-1)).toBeCloseTo(0, 5);
    expect(incoming!.values.at(0)).toBeCloseTo(0, 2);
    expect(incoming!.values.at(-1)).toBeCloseTo(0.8, 5);
    expect(outgoing!.duration).toBeGreaterThan(3.5);
    expect(outgoing!.duration).toBeLessThanOrEqual(4);
    expect(deckB.paused, 'the incoming deck plays').toBe(false);
    expect(usePlaybackStore.getState().currentTrack?.id).toBe('a');

    elapse(4500);
    const state = usePlaybackStore.getState();
    expect(state.currentTrack?.id, 'the crossfade completed and advanced').toBe('b');
    expect(state.queueIndex).toBe(1);
    expect(deckA.paused, 'the outgoing deck is stopped').toBe(true);
    expect(deckB.paused).toBe(false);
  });

  it('fades the sleep timer out to silence on the audio clock', () => {
    play([track('a')], { sleepFadeDuration: 12 });
    renderHook(() => useAudioEngine());
    elapse(1000);

    act(() => {
      usePlaybackStore.getState()._setSleepFading(true);
    });

    const fade = graph.ramps.filter(ramp => ramp.deck === 'A').at(-1);
    expect(fade, 'the fade is scheduled the moment the timer asks').toBeDefined();
    expect(fade!.values.at(0)).toBeCloseTo(0.8, 2);
    expect(fade!.values.at(-1), 'it ends in silence').toBeCloseTo(0, 5);
    expect(fade!.duration).toBeCloseTo(12, 5);
  });

  it('restores the volume when the sleep timer is cancelled mid-fade', async () => {
    play([track('a')], { sleepFadeDuration: 12 });
    renderHook(() => useAudioEngine());
    act(() => {
      usePlaybackStore.getState()._setSleepFading(true);
    });
    elapse(3000);
    graph.gains = [];

    await act(async () => {
      usePlaybackStore.getState()._setSleepFading(false);
      await Promise.resolve();
    });

    expect(graph.gains).toContainEqual({ deck: 'A', value: 0.8 });
  });

  it('counts listening time while no frames run', async () => {
    const [first, second] = [track('a'), track('b')];
    play([first, second]);
    renderHook(() => useAudioEngine());

    elapse(45_000);
    await act(async () => {
      usePlaybackStore.getState().next();
      await Promise.resolve();
    });

    const recordPlay = vi.mocked(window.electronAPI.db.history.recordPlay);
    expect(recordPlay).toHaveBeenCalled();
    const [{ playedSeconds }] = recordPlay.mock.calls.at(-1)!;
    expect(playedSeconds).toBeGreaterThan(44);
    expect(playedSeconds).toBeLessThanOrEqual(45.5);
  });

  it('keeps the store position moving for the OS surfaces and resume', () => {
    play([track('a')]);
    renderHook(() => useAudioEngine());

    elapse(10_000);

    expect(usePlaybackStore.getState().currentTime).toBeGreaterThan(9.5);
  });
});

/**
 * A sleep fade that is running when the crossfade window arrives. The crossfade
 * takes the gains over and the fade ends; whatever the user or the timer does
 * during the crossfade, the next track must end up audible. The regression
 * this pins: the fade stayed marked active through the crossfade, and the next
 * track was then "faded" from a start time long past, straight to silence.
 */
describe('a sleep fade overlapping a crossfade', () => {
  function crossfadeDuringSleepFade(sleepFadeDuration: number) {
    play([track('a'), track('b')], {
      crossfadeEnabled: true,
      crossfadeDuration: 4,
      sleepFadeDuration,
    });
    renderHook(() => useAudioEngine());
    const [deckA] = FakeAudio.decks;
    act(() => {
      deckA.currentTime = TRACK_SECONDS - 8;
    });
    elapse(500);
    act(() => {
      usePlaybackStore.getState()._setSleepFading(true);
    });
    // Into the crossfade window: the crossfade starts while the fade runs.
    elapse(4000);
    expect(graph.ramps.some(ramp => ramp.deck === 'B')).toBe(true);
  }

  /** The gain the deck is left at: a plain set, or where its last ramp ends. */
  function settledGain(deck: 'A' | 'B'): number | null {
    return graph.last[deck];
  }

  it('(d) cancelling the sleep timer mid-crossfade leaves the next track audible', async () => {
    crossfadeDuringSleepFade(12);

    await act(async () => {
      usePlaybackStore.getState()._setSleepFading(false);
      await Promise.resolve();
    });
    elapse(5000);

    expect(usePlaybackStore.getState().currentTrack?.id).toBe('b');
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    expect(settledGain('B')).toBeCloseTo(0.8, 2);
  });

  it('(b) the timer pausing mid-crossfade, then a later play, is audible', async () => {
    crossfadeDuringSleepFade(8);

    await act(async () => {
      // Exactly what the sleep timer's fade timeout does.
      const s = usePlaybackStore.getState();
      s._setSleepFading(false);
      s.pause();
      await Promise.resolve();
    });
    elapse(60_000);
    await act(async () => {
      usePlaybackStore.getState().play();
      await Promise.resolve();
    });
    elapse(1000);

    expect(usePlaybackStore.getState().currentTrack?.id).toBe('b');
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    expect(settledGain('B')).toBeCloseTo(0.8, 2);
  });

  /**
   * Nobody intervenes: the timer is still fading when the crossfade completes.
   * The crossfade ended the old fade, so the next track gets a fresh one from
   * the user's volume, the old frame loop's behaviour, rather than inheriting
   * a fade whose start time lies in the previous track.
   */
  it('(e) a fade still running after the crossfade starts afresh on the next track', () => {
    crossfadeDuringSleepFade(30);

    elapse(5000);

    expect(usePlaybackStore.getState().currentTrack?.id).toBe('b');
    const onB = graph.ramps.filter(ramp => ramp.deck === 'B');
    // The fresh fade: the full length, from the user's volume. (Later ramps
    // on B are the same fade rescheduled from its progress.)
    const fresh = onB.find(ramp => ramp.duration > 29);
    expect(fresh, 'a full-length fade starts on the next track').toBeDefined();
    expect(fresh!.values.at(0)).toBeCloseTo(0.8, 2);
    expect(onB.at(-1)!.values.at(-1), 'it still ends in silence').toBeCloseTo(0, 5);
  });

  it('(c) a manual pause and resume during that crossfade is audible', async () => {
    crossfadeDuringSleepFade(12);

    await act(async () => {
      usePlaybackStore.getState().pause();
      await Promise.resolve();
    });
    elapse(30_000);
    await act(async () => {
      usePlaybackStore.getState().play();
      await Promise.resolve();
    });
    elapse(1000);

    expect(usePlaybackStore.getState().currentTrack?.id).toBe('b');
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    expect(settledGain('B')).toBeCloseTo(0.8, 2);
  });
});

describe('a crossfade that starts late', () => {
  /**
   * The clock ticks every 250 ms, so the crossfade can start after its window
   * opened. The ramp must still end by the time the outgoing track does.
   */
  it('ramps over what is left of the outgoing track, not the full length', () => {
    play([track('a'), track('b')], { crossfadeEnabled: true, crossfadeDuration: 4 });
    renderHook(() => useAudioEngine());
    const [deckA] = FakeAudio.decks;

    // Already inside the window when the clock first looks: 3 s left.
    act(() => {
      deckA.currentTime = TRACK_SECONDS - 3;
    });
    elapse(250);

    const outgoing = graph.ramps.filter(ramp => ramp.deck === 'A').at(-1);
    expect(outgoing).toBeDefined();
    expect(outgoing!.duration).toBeLessThanOrEqual(3);
    expect(outgoing!.duration).toBeGreaterThan(2.5);
    expect(outgoing!.values.at(-1)).toBeCloseTo(0, 5);
  });
});

describe('sampleRamp', () => {
  it('samples the rest of a curve, scaled, ending on its final value', () => {
    const values = sampleRamp(fadeOut, 0.5, 0.8, 2);
    expect(values.at(0)).toBeCloseTo(0.8 * fadeOut(0.5), 6);
    expect(values.at(-1)).toBeCloseTo(0, 6);
    expect(values.length).toBeGreaterThanOrEqual(61);
  });

  it('never produces fewer than two points', () => {
    expect(sampleRamp(fadeIn, 0.999, 1, 0.001)).toHaveLength(2);
  });
});

describe('creditedListeningSeconds', () => {
  it('credits the media time played between two sparse ticks', () => {
    // A hidden window may tick once a minute; a minute of audio is a minute.
    expect(creditedListeningSeconds(60, 60)).toBe(60);
  });

  it('never credits more than the wall clock allows', () => {
    // A seek forward moves the media clock without time passing.
    expect(creditedListeningSeconds(90, 1)).toBeCloseTo(1.25, 6);
  });

  it('credits nothing when the media clock did not move forward', () => {
    expect(creditedListeningSeconds(0, 5)).toBe(0);
    expect(creditedListeningSeconds(-30, 5)).toBe(0);
    expect(creditedListeningSeconds(Number.NaN, 5)).toBe(0);
  });
});
