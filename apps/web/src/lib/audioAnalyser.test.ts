import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EQ_BANDS,
  acquireAmbientBus,
  applyEqPreset,
  destroyAnalyser,
  getFrequencyData,
  initAnalyser,
  isAnalyserReady,
  releaseAmbientBus,
  setEqBand,
  setEqEnabled,
  setPreampDb,
  subscribeAudioGraph,
} from './audioAnalyser';
import { dbToLinear } from '@/lib/loudness';

/**
 * Minimal Web Audio fake. jsdom has no AudioContext, so the graph is modelled
 * as a directed set of edges we can walk — that lets the tests assert what the
 * audio thread would actually have to render in each EQ state.
 */

class FakeParam {
  constructor(public value: number) {}
  cancelScheduledValues(): FakeParam {
    return this;
  }
  setValueAtTime(value: number): FakeParam {
    this.value = value;
    return this;
  }
  // Ramps settle immediately so assertions can read the target value.
  linearRampToValueAtTime(value: number): FakeParam {
    this.value = value;
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
  disconnect(dest?: FakeNode): void {
    if (!dest) {
      this.outputs.clear();
      return;
    }
    if (!this.outputs.has(dest)) throw new Error('InvalidAccessError');
    this.outputs.delete(dest);
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  constructor() {
    super('gain');
  }
}

class FakeBiquad extends FakeNode {
  type = 'peaking';
  readonly frequency = new FakeParam(350);
  readonly gain = new FakeParam(0);
  readonly Q = new FakeParam(1);
  constructor() {
    super('biquad');
  }
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
  constructor() {
    super('compressor');
  }
}

class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  constructor() {
    super('analyser');
  }
  getByteFrequencyData(buffer: Uint8Array): void {
    // Stand-in for real spectrum data so the visualizer assertions have signal.
    buffer.fill(128);
  }
}

interface CreatedNodes {
  gains: FakeGain[];
  biquads: FakeBiquad[];
  compressors: FakeCompressor[];
  analysers: FakeAnalyser[];
  sources: FakeNode[];
}

let created: CreatedNodes;
let contexts: FakeAudioContext[];

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  readonly destination = new FakeNode('destination');
  readonly resume = vi.fn(() => Promise.resolve());
  readonly close = vi.fn(() => Promise.resolve());

  constructor() {
    contexts.push(this);
  }
  createGain(): FakeGain {
    const node = new FakeGain();
    created.gains.push(node);
    return node;
  }
  createBiquadFilter(): FakeBiquad {
    const node = new FakeBiquad();
    created.biquads.push(node);
    return node;
  }
  createDynamicsCompressor(): FakeCompressor {
    const node = new FakeCompressor();
    created.compressors.push(node);
    return node;
  }
  createAnalyser(): FakeAnalyser {
    const node = new FakeAnalyser();
    created.analysers.push(node);
    return node;
  }
  createMediaElementSource(): FakeNode {
    const node = new FakeNode('source');
    created.sources.push(node);
    return node;
  }
}

/** Depth-first reachability over the modelled graph. */
function reaches(from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>();
  const stack: FakeNode[] = [from];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of node.outputs) stack.push(next);
  }
  return false;
}

/** Reachability with one node removed from the graph. */
function reachesAvoiding(from: FakeNode, to: FakeNode, avoid: FakeNode): boolean {
  const seen = new Set<FakeNode>([avoid]);
  const stack: FakeNode[] = [from];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of node.outputs) stack.push(next);
  }
  return false;
}

/** Every node on some path from `from` to `to`. */
function nodesBetween(from: FakeNode, to: FakeNode): FakeNode[] {
  return [...allNodes()].filter(n => n !== from && reaches(from, n) && reaches(n, to));
}

function allNodes(): Set<FakeNode> {
  return new Set<FakeNode>([
    ...created.gains,
    ...created.biquads,
    ...created.compressors,
    ...created.analysers,
    ...created.sources,
  ]);
}

/** The graph pieces the module builds, in creation order. */
function graph() {
  const [gainA, gainB, mixGain, preamp, dryGain, musicBus] = created.gains;
  return {
    gainA,
    gainB,
    mixGain,
    preamp,
    dryGain,
    musicBus,
    // The wet gain is created with the biquads, after the base chain's 6 gains.
    eqGain: created.gains.at(6),
    limiter: created.compressors[0],
    analyser: created.analysers[0],
  };
}

function initGraph() {
  return initAnalyser(new Audio(), new Audio());
}

describe('audioAnalyser EQ bypass', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    created = { gains: [], biquads: [], compressors: [], analysers: [], sources: [] };
    contexts = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  afterEach(() => {
    destroyAnalyser();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('with the EQ never enabled (the default)', () => {
    it('builds no biquads at all', () => {
      initGraph();

      expect(isAnalyserReady()).toBe(true);
      expect(created.biquads).toHaveLength(0);
    });

    it('routes the decks through the dry branch and the music bus into the limiter', () => {
      initGraph();
      const { gainA, gainB, mixGain, preamp, dryGain, musicBus, limiter, analyser } = graph();

      expect(reaches(gainA, mixGain)).toBe(true);
      expect(reaches(gainB, mixGain)).toBe(true);
      expect(mixGain.outputs.has(preamp)).toBe(true);
      expect(preamp.outputs.has(dryGain)).toBe(true);
      expect(dryGain.outputs.has(musicBus)).toBe(true);
      expect(musicBus.outputs.has(limiter)).toBe(true);
      expect(musicBus.outputs.has(analyser)).toBe(true);
      expect(limiter.outputs.has(contexts[0].destination)).toBe(true);
      expect(dryGain.gain.value).toBe(1);
    });

    it('keeps the preamp live so its dB setting still applies', () => {
      initGraph();
      const { preamp } = graph();

      setPreampDb(6);

      expect(preamp.gain.value).toBeCloseTo(dbToLinear(6), 6);
    });

    it('ignores band writes instead of forcing the filters into existence', () => {
      initGraph();

      setEqBand(0, 6);
      applyEqPreset([6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);

      expect(created.biquads).toHaveLength(0);
    });
  });

  describe('enabling after playback has started', () => {
    it('builds the 10 bands on first enable and splices them in', () => {
      initGraph();
      expect(created.biquads).toHaveLength(0);

      setEqEnabled(true);
      const { preamp, dryGain, eqGain, musicBus } = graph();

      expect(created.biquads).toHaveLength(EQ_BANDS.length);
      expect(eqGain).toBeDefined();
      expect(preamp.outputs.has(created.biquads[0])).toBe(true);
      expect(eqGain?.outputs.has(musicBus)).toBe(true);
      // Crossfaded, not switched: dry out, wet in.
      expect(dryGain.gain.value).toBe(0);
      expect(eqGain?.gain.value).toBe(1);
    });

    it('configures the shelves, peaks and band frequencies', () => {
      initGraph();
      setEqEnabled(true);

      expect(created.biquads.map(n => n.frequency.value)).toEqual([...EQ_BANDS]);
      expect(created.biquads[0].type).toBe('lowshelf');
      expect(created.biquads[created.biquads.length - 1].type).toBe('highshelf');
      expect(created.biquads[1].type).toBe('peaking');
    });

    it('applies the persisted preset the caller replays after enabling', () => {
      initGraph();
      const gains = [1, 2, 3, 4, 5, -1, -2, -3, -4, -5];

      setEqEnabled(true);
      applyEqPreset(gains);

      expect(created.biquads.map(n => n.gain.value)).toEqual(gains);
    });

    it('does not rebuild the filters on a second enable', () => {
      initGraph();
      setEqEnabled(true);
      const first = [...created.biquads];

      setEqEnabled(true);

      expect(created.biquads).toEqual(first);
    });
  });

  describe('disabling after it was enabled', () => {
    it('fades back to dry before unwiring anything', () => {
      initGraph();
      setEqEnabled(true);
      const { preamp, dryGain, eqGain, musicBus } = graph();

      setEqEnabled(false);

      expect(dryGain.gain.value).toBe(1);
      expect(eqGain?.gain.value).toBe(0);
      // Still wired while the ramp is in flight — disconnecting mid-fade pops.
      expect(preamp.outputs.has(created.biquads[0])).toBe(true);
      expect(eqGain?.outputs.has(musicBus)).toBe(true);
    });

    it('drops the filters out of the render graph once the ramp is done', () => {
      initGraph();
      setEqEnabled(true);
      setEqEnabled(false);
      const { preamp, musicBus, analyser, eqGain } = graph();

      vi.runAllTimers();

      expect(preamp.outputs.has(created.biquads[0])).toBe(false);
      expect(eqGain?.outputs.has(musicBus)).toBe(false);
      expect(nodesBetween(preamp, analyser)).not.toContain(created.biquads[0]);
      expect(reaches(preamp, analyser)).toBe(true);
    });

    it('cancels the pending unwire when re-enabled mid-fade', () => {
      initGraph();
      setEqEnabled(true);
      setEqEnabled(false);
      setEqEnabled(true);

      vi.runAllTimers();

      const { preamp, dryGain, eqGain, musicBus } = graph();
      expect(preamp.outputs.has(created.biquads[0])).toBe(true);
      expect(eqGain?.outputs.has(musicBus)).toBe(true);
      expect(dryGain.gain.value).toBe(0);
      expect(eqGain?.gain.value).toBe(1);
    });

    it('preserves band gains and reuses the same filters across a cycle', () => {
      initGraph();
      const gains = [3, -3, 6, -6, 1.5, 0, 2, 4, -2, 5];
      setEqEnabled(true);
      applyEqPreset(gains);
      const built = [...created.biquads];

      setEqEnabled(false);
      vi.runAllTimers();
      setEqEnabled(true);

      expect(created.biquads).toEqual(built);
      expect(created.biquads.map(n => n.gain.value)).toEqual(gains);
    });
  });

  describe('the limiter as the only way out', () => {
    it('is the only path from the decks to the speakers, EQ off or on', () => {
      initGraph();
      const { gainA, gainB, limiter } = graph();
      const destination = contexts[0].destination;

      for (const eqOn of [false, true]) {
        setEqEnabled(eqOn);
        vi.runAllTimers();
        for (const deck of [gainA, gainB]) {
          expect(reaches(deck, destination)).toBe(true);
          expect(reachesAvoiding(deck, destination, limiter)).toBe(false);
        }
      }
    });

    it('leaves the analyser tap with no outputs, so it can never bypass the limiter', () => {
      initGraph();
      const { analyser } = graph();

      expect(analyser.outputs.size).toBe(0);
    });
  });

  describe('a throwing graph listener', () => {
    it('cannot abort the graph build or starve the other listeners', () => {
      const after = vi.fn();
      const unsubscribeThrowing = subscribeAudioGraph(() => {
        throw new Error('listener bug');
      });
      const unsubscribeAfter = subscribeAudioGraph(after);

      expect(() => initGraph()).not.toThrow();
      expect(isAnalyserReady()).toBe(true);
      expect(after).toHaveBeenCalledTimes(1);

      unsubscribeThrowing();
      unsubscribeAfter();
    });
  });

  describe('analyser tap', () => {
    it('stays fed by the deck mix while the EQ is bypassed', () => {
      initGraph();
      const { gainA, gainB, analyser } = graph();

      expect(reaches(gainA, analyser)).toBe(true);
      expect(reaches(gainB, analyser)).toBe(true);
      expect(getFrequencyData(new Uint8Array(128))).toBe(true);
    });

    it('keeps receiving data across an enable/disable cycle', () => {
      initGraph();
      const { gainA, analyser, musicBus } = graph();
      const buffer = new Uint8Array(128);

      setEqEnabled(true);
      expect(reaches(gainA, analyser)).toBe(true);
      expect(musicBus.outputs.has(analyser)).toBe(true);
      expect(getFrequencyData(buffer)).toBe(true);
      expect(buffer[0]).toBe(128);

      setEqEnabled(false);
      vi.runAllTimers();
      expect(reaches(gainA, analyser)).toBe(true);
      expect(musicBus.outputs.has(analyser)).toBe(true);
      expect(getFrequencyData(buffer)).toBe(true);
    });

    it('reports no data before the graph exists', () => {
      expect(getFrequencyData(new Uint8Array(128))).toBe(false);
      expect(isAnalyserReady()).toBe(false);
    });
  });

  describe('ambience bus', () => {
    /** The bus as a modelled node (the handle types it as a real GainNode). */
    function ambientInput(): FakeNode {
      const handle = acquireAmbientBus();
      if (!handle) throw new Error('graph not ready');
      return handle.input as unknown as FakeNode;
    }

    it('is unavailable until the music graph exists', () => {
      expect(acquireAmbientBus()).toBeNull();
    });

    it('is not built until the ambience engine asks for it', () => {
      initGraph();

      expect(created.gains).toHaveLength(6);
    });

    it('reaches the limiter and the speakers', () => {
      initGraph();
      const bus = ambientInput();
      const { limiter } = graph();

      expect(bus.outputs.has(limiter)).toBe(true);
      expect(reaches(bus, contexts[0].destination)).toBe(true);
    });

    it('bypasses the deck gains, loudness leveling, EQ and the analyser', () => {
      initGraph();
      setEqEnabled(true);
      const bus = ambientInput();
      const { gainA, gainB, preamp, dryGain, musicBus, eqGain, analyser } = graph();

      const path = nodesBetween(bus, contexts[0].destination);
      for (const node of [gainA, gainB, preamp, dryGain, musicBus, eqGain, analyser]) {
        expect(path).not.toContain(node);
      }
      for (const biquad of created.biquads) expect(path).not.toContain(biquad);
      expect(reaches(bus, analyser)).toBe(false);
    });

    it('is shared across acquisitions', () => {
      initGraph();

      expect(ambientInput()).toBe(ambientInput());
      expect(created.gains).toHaveLength(7);
    });

    it('leaves the graph entirely when released', () => {
      initGraph();
      const bus = ambientInput();
      const { limiter } = graph();

      releaseAmbientBus();

      expect(bus.outputs.size).toBe(0);
      expect(reaches(bus, limiter)).toBe(false);
      expect(ambientInput()).not.toBe(bus);
    });

    it('tells subscribers when the graph appears and goes away', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAudioGraph(listener);

      initGraph();
      expect(listener).toHaveBeenCalledTimes(1);

      destroyAnalyser();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(acquireAmbientBus()).toBeNull();

      unsubscribe();
      initGraph();
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('teardown', () => {
    it('is a no-op when the graph was never initialised', () => {
      expect(() => setEqEnabled(true)).not.toThrow();
      expect(created.biquads).toHaveLength(0);
    });

    it('closes the context and clears a pending unwire', () => {
      initGraph();
      setEqEnabled(true);
      setEqEnabled(false);

      destroyAnalyser();
      vi.runAllTimers();

      expect(contexts[0].close).toHaveBeenCalled();
      expect(isAnalyserReady()).toBe(false);
    });
  });
});
