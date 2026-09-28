import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AMBIENT_LEVELS, type AmbientLayerId } from '@/stores/useAmbientStore';
import { fadeOut } from '@/hooks/useAudioEngine';
import {
  createAmbientEngine,
  sleepFadeCurve,
  type ILayerAssets,
  type IAmbientEngine,
} from './engine';
import type { AmbientTarget } from './target';

/**
 * Minimal Web Audio fake in the style of `audioAnalyser.test.ts`: nodes are
 * edges we can walk, params record their automation, and the context's
 * clock is set by hand.
 */

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

class FakeParam {
  readonly curves: Array<{ curve: Float32Array; start: number; duration: number }> = [];
  /** Every `linearRampToValueAtTime` call, as { value, endTime }. */
  readonly ramps: Array<{ value: number; endTime: number }> = [];
  cancels = 0;
  constructor(public value: number) {}
  cancelScheduledValues(): FakeParam {
    this.cancels += 1;
    return this;
  }
  setValueAtTime(value: number): FakeParam {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, endTime: number): FakeParam {
    this.ramps.push({ value, endTime });
    this.value = value;
    return this;
  }
  setValueCurveAtTime(curve: Float32Array, start: number, duration: number): FakeParam {
    this.curves.push({ curve, start, duration });
    this.value = curve[curve.length - 1];
    return this;
  }
}

class FakeNode {
  readonly outputs = new Set<FakeNode>();
  constructor(readonly kind: string) {}
  connect(dest: FakeNode): FakeNode {
    this.outputs.add(dest);
    return dest;
  }
  disconnect(): void {
    this.outputs.clear();
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  constructor() {
    super('gain');
  }
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0);
  constructor() {
    super('panner');
  }
}

class FakeBuffer {
  constructor(
    readonly length: number,
    readonly sampleRate: number
  ) {}
  get duration(): number {
    return this.length / this.sampleRate;
  }
  copyToChannel(): void {}
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  readonly playbackRate = new FakeParam(1);
  started: { when: number; offset: number } | null = null;
  stopped = false;
  constructor() {
    super('source');
  }
  start(when = 0, offset = 0): void {
    this.started = { when, offset };
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeContext {
  currentTime = 10;
  readonly sampleRate = 48000;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly panners: FakePanner[] = [];
  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createStereoPanner(): FakePanner {
    const node = new FakePanner();
    this.panners.push(node);
    return node;
  }
  createBufferSource(): FakeSource {
    const node = new FakeSource();
    this.sources.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(length, sampleRate);
  }
}

// The audio graph module, reduced to the two calls the engine makes.
const graph = vi.hoisted(() => ({
  handle: null as { context: unknown; input: unknown } | null,
  released: 0,
}));

vi.mock('@/lib/audioAnalyser', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/audioAnalyser')>()),
  acquireAmbientBus: () => graph.handle,
  releaseAmbientBus: () => {
    graph.released += 1;
  },
}));

let context: FakeContext;
let busInput: FakeGain;
let engine: IAmbientEngine;
let loader: ReturnType<typeof vi.fn>;

function fakeAssets(ctx: FakeContext, id: AmbientLayerId): ILayerAssets {
  const bed = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate) as unknown as AudioBuffer;
  const grain = ctx.createBuffer(1, 100, ctx.sampleRate) as unknown as AudioBuffer;
  return {
    bed,
    loopStart: 0,
    loopEnd: 2,
    grains:
      id === 'rain'
        ? {
            buffers: [grain],
            spec: {
              variants: [],
              ratePerSecond: 5,
              gain: [0.01, 0.1],
              pitch: [0.9, 1.1],
              spread: 0.8,
            },
          }
        : null,
  };
}

function target(overrides: Partial<AmbientTarget> = {}): AmbientTarget {
  return {
    mode: 'play',
    gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.25 },
    sleepFadeSeconds: 8,
    keepBuffers: true,
    ...overrides,
  };
}

/** The master gain: the only node the engine connects to the bus. */
function master(): FakeGain {
  const found = context.gains.find(g => g.outputs.has(busInput));
  if (!found) throw new Error('no master on the bus');
  return found;
}

function bedSources(): FakeSource[] {
  return context.sources.filter(s => s.loop);
}

async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('ambience engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    context = new FakeContext();
    busInput = new FakeGain();
    graph.handle = { context, input: busInput };
    graph.released = 0;
    loader = vi.fn((ctx: FakeContext, id: AmbientLayerId) => Promise.resolve(fakeAssets(ctx, id)));
    engine = createAmbientEngine(loader as never);
  });

  afterEach(() => {
    engine.dispose();
    vi.useRealTimers();
  });

  it('fades in on the ambience bus and loops each audible layer', async () => {
    engine.apply(target());
    await settle();

    expect(master().gain.value).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0][1]).toBe('rain');
    const beds = bedSources();
    expect(beds).toHaveLength(2);
    for (const source of beds) {
      expect(source.started).not.toBeNull();
      expect(source.loopEnd).toBe(2);
    }
  });

  it('offsets and pans the two bed voices apart for width', async () => {
    engine.apply(target());
    await settle();

    const [a, b] = bedSources();
    expect(a.started?.offset).not.toBe(b.started?.offset);
    const pans = context.panners.slice(0, 2).map(p => p.pan.value);
    expect(pans[0]).toBe(-pans[1]);
    expect(pans[0]).not.toBe(0);
  });

  it('builds nothing until the music graph exists, then catches up', async () => {
    graph.handle = null;
    engine.apply(target());
    await settle();
    expect(context.gains).toHaveLength(0);

    graph.handle = { context, input: busInput };
    engine.graphChanged();
    await settle();

    expect(master().gain.value).toBe(1);
    expect(bedSources()).toHaveLength(2);
  });

  it('scatters rain grains ahead of the clock', async () => {
    engine.apply(target());
    await settle();
    vi.advanceTimersByTime(250);

    const grains = context.sources.filter(s => !s.loop);
    expect(grains.length).toBeGreaterThan(0);
    for (const grain of grains) {
      expect(grain.started?.when).toBeGreaterThanOrEqual(context.currentTime);
      expect(grain.started?.when).toBeLessThanOrEqual(context.currentTime + 1.2);
    }
  });

  it('moves a slider without restarting the layer', async () => {
    engine.apply(target());
    await settle();
    const voiceGain = context.gains.find(g => g.outputs.has(master()));

    engine.apply(target({ gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.64 } }));

    expect(voiceGain?.gain.value).toBe(0.64);
    expect(bedSources()).toHaveLength(2);
  });

  it('drops a layer pulled to zero once its ramp is done', async () => {
    engine.apply(target({ gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.25, noise: 0.25 } }));
    await settle();
    expect(bedSources()).toHaveLength(4);

    engine.apply(target({ gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.25, noise: 0 } }));
    vi.advanceTimersByTime(500);

    expect(bedSources().filter(s => s.stopped)).toHaveLength(2);
  });

  describe('repeated identical targets', () => {
    /** Automation calls across every param the engine owns (master, voices, panners). */
    function automationCalls(): number {
      const params = [...context.gains.map(g => g.gain), ...context.panners.map(p => p.pan)];
      return params.reduce((n, p) => n + p.ramps.length + p.cancels + p.curves.length, 0);
    }

    it('schedule no automation at all', async () => {
      engine.apply(target({ gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.25, fire: 0.1 } }));
      await settle();
      const before = automationCalls();

      // The driver re-evaluates on every playback-store write (currentTime ticks
      // at ~4 Hz), so an unchanged target must be free.
      for (let i = 0; i < 240; i++) {
        engine.apply(target({ gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.25, fire: 0.1 } }));
      }

      expect(automationCalls()).toBe(before);
    });

    it('keep the ease-in of a layer whose buffer arrives mid-play', async () => {
      let finishLoad: (assets: ILayerAssets) => void = () => {};
      loader.mockImplementationOnce(
        () => new Promise<ILayerAssets>(resolve => (finishLoad = resolve))
      );
      engine.apply(target());
      await settle();
      const voiceGain = context.gains.find(g => g.outputs.has(master()));
      if (!voiceGain) throw new Error('no voice gain');

      finishLoad(fakeAssets(context, 'rain'));
      await settle();
      const easeIn = voiceGain.gain.ramps.at(-1);
      expect(easeIn?.endTime).toBeCloseTo(context.currentTime + 0.4);

      engine.apply(target());

      expect(voiceGain.gain.ramps.at(-1)).toBe(easeIn);
      expect(voiceGain.gain.cancels).toBe(1);
    });
  });

  it('stops the grain timer once no grain layer is audible', async () => {
    engine.apply(target({ gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.25, noise: 0.25 } }));
    await settle();
    expect(vi.getTimerCount()).toBe(1);

    engine.apply(target({ gains: { ...DEFAULT_AMBIENT_LEVELS, rain: 0, noise: 0.25 } }));
    vi.advanceTimersByTime(500);

    // Warm noise has no grains: nothing is left ticking while it plays alone.
    expect(vi.getTimerCount()).toBe(0);
    expect(bedSources().filter(s => !s.stopped)).toHaveLength(2);
  });

  describe('going idle', () => {
    it('fades out, then stops every source and hands the bus back', async () => {
      engine.apply(target());
      await settle();
      const m = master();

      engine.apply(target({ mode: 'idle' }));
      expect(m.gain.value).toBe(0);
      // Still wired while the fade plays out.
      expect(bedSources().some(s => s.stopped)).toBe(false);
      expect(graph.released).toBe(0);

      vi.advanceTimersByTime(1000);

      expect(context.sources.every(s => s.stopped || !s.started)).toBe(true);
      expect(m.outputs.size).toBe(0);
      expect(graph.released).toBe(1);
    });

    it('leaves no timer running, so an idle ambience costs nothing', async () => {
      engine.apply(target());
      await settle();
      engine.apply(target({ mode: 'idle' }));
      vi.advanceTimersByTime(1000);

      expect(vi.getTimerCount()).toBe(0);
    });

    it('resumes instantly from its cached buffers while switched on', async () => {
      engine.apply(target());
      await settle();
      engine.apply(target({ mode: 'idle', keepBuffers: true }));
      vi.advanceTimersByTime(1000);

      engine.apply(target());
      await settle();

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('releases its buffers when switched off', async () => {
      engine.apply(target());
      await settle();
      engine.apply(target({ mode: 'idle', keepBuffers: false }));
      vi.advanceTimersByTime(1000);

      engine.apply(target());
      await settle();

      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('is cancelled by playing again mid-fade', async () => {
      engine.apply(target());
      await settle();
      engine.apply(target({ mode: 'idle' }));
      engine.apply(target());
      vi.advanceTimersByTime(1000);

      expect(bedSources().some(s => s.stopped)).toBe(false);
      expect(master().gain.value).toBe(1);
      expect(graph.released).toBe(0);
    });
  });

  describe('sleep fade', () => {
    it('follows the timer with an equal-power curve over its fade length', async () => {
      engine.apply(target());
      await settle();

      engine.apply(target({ mode: 'sleep', sleepFadeSeconds: 12 }));

      const [fade] = master().gain.curves;
      expect(fade.duration).toBe(12);
      expect(fade.start).toBe(context.currentTime);
      expect(fade.curve[0]).toBe(1);
      expect(fade.curve[fade.curve.length - 1]).toBeCloseTo(0, 6);
      // Equal-power: still at cos(π/4) halfway through, not at 0.5.
      const mid = fade.curve[Math.round((fade.curve.length - 1) / 2)];
      expect(mid).toBeGreaterThan(0.6);
    });

    it('uses the same curve the audio engine fades the deck with', () => {
      for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        expect(sleepFadeCurve(p)).toBeCloseTo(fadeOut(p), 12);
      }
    });

    it('does not restart the curve on repeated sleep targets', async () => {
      engine.apply(target());
      await settle();
      engine.apply(target({ mode: 'sleep' }));
      engine.apply(target({ mode: 'sleep' }));

      expect(master().gain.curves).toHaveLength(1);
    });

    it('comes back up when the timer is cancelled', async () => {
      engine.apply(target());
      await settle();
      engine.apply(target({ mode: 'sleep' }));
      engine.apply(target());

      expect(master().gain.value).toBe(1);
    });
  });

  it('rebuilds on a new graph after the old one is torn down', async () => {
    engine.apply(target());
    await settle();
    const oldMaster = master();

    const nextContext = new FakeContext();
    const nextBus = new FakeGain();
    graph.handle = { context: nextContext, input: nextBus };
    engine.graphChanged();
    await settle();

    expect(oldMaster.outputs.size).toBe(0);
    expect(nextContext.gains.some(g => g.outputs.has(nextBus))).toBe(true);
    // Buffers belong to a context: the new one gets its own.
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
