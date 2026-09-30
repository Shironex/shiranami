/**
 * The ambience engine: turns an `AmbientTarget` into sound on the shared
 * AudioContext, through the ambience bus `audioAnalyser` hands out.
 *
 * Loaded lazily by the driver the first time ambience should be heard, so the
 * DSP and this module stay out of the entry chunk for everyone who never
 * turns it on.
 *
 * Per layer (a "voice"):
 *
 *   bed ─ source (offset 0)    → pan −w ┐
 *   bed ─ source (offset 0.37) → pan +w ┼→ voice gain → master → ambience bus → limiter
 *   grains → gain → pan bus [−s … +s]  ┘
 *
 * The bed buffer is mono and played by two sources started at different
 * offsets and panned apart, which gives stereo width from a single buffer
 * (the two ears hear uncorrelated noise) at half the memory of a stereo loop.
 * Grains are scattered by a lookahead scheduler on a timer; if the timer is
 * throttled (hidden window) a few events go missing, the bed carries on.
 *
 * Idle is free: when the target goes idle the master fades out, then every
 * source is stopped, every node disconnected, the scheduler cleared and the
 * bus handed back, so the audio thread renders nothing for ambience at all.
 */

import { acquireAmbientBus, releaseAmbientBus, type AmbientBusHandle } from '@/lib/audioAnalyser';
import { logger } from '@/lib/logger';
import { seededRandom } from '@/lib/showcase/determinism';
import { AMBIENT_LAYER_IDS, type AmbientLayerId } from '@/stores/useAmbientStore';
import { CAFE_LOOP_SECONDS, CAFE_PAD_SECONDS } from './cafe';
import cafeLoopUrl from './assets/cafe-loop.mp3?url';
import { LAYER_SEEDS, PROCEDURAL_RENDERERS, type GrainSpec } from './recipes';
import type { AmbientTarget } from './target';

/** Fade from silence when ambience starts (or resumes with the music). */
const FADE_IN_SECONDS = 1.5;
/** Fade to silence before the sources are stopped. */
const FADE_OUT_SECONDS = 0.8;
/** Slider moves: short enough to feel direct, long enough not to zipper. */
const LEVEL_RAMP_SECONDS = 0.08;
/** A layer whose buffer arrives after the master is already up eases in over this. */
const LATE_START_SECONDS = 0.4;
/** Extra wait past a fade before tearing down, so the ramp has certainly landed. */
const TEARDOWN_GRACE_MS = 100;

const SCHEDULER_INTERVAL_MS = 250;
/** Grains are placed this far ahead; covers a timer throttled to ~1 s. */
const SCHEDULE_AHEAD_SECONDS = 1.2;
/** Points in the sleep fade curve handed to `setValueCurveAtTime`. */
const SLEEP_CURVE_POINTS = 64;

/**
 * The equal-power fade-out the audio engine ramps the active deck with
 * (`fadeOut` in `useAudioEngine`), restated here so this lazy chunk does not
 * import the audio engine's whole module graph. `engine.test.ts` pins the two
 * together.
 */
export function sleepFadeCurve(progress: number): number {
  return Math.cos(progress * Math.PI * 0.5);
}

/** Offset of the second bed voice, as a fraction of the loop. */
const SECOND_VOICE_OFFSET = 0.37;

/** Stereo width of each bed (pan of its two voices). */
const BED_WIDTH: Record<AmbientLayerId, number> = {
  rain: 0.6,
  vinyl: 0.3,
  noise: 0.5,
  fire: 0.45,
  cafe: 0.5,
};

/** Layers whose recipe scatters live grains (the rest are bed only). */
const GRAIN_LAYERS: ReadonlySet<AmbientLayerId> = new Set(['rain', 'vinyl', 'fire']);

/** Pan positions of a layer's grain buses, scaled by the recipe's spread. */
const GRAIN_PAN_POSITIONS = [-1, -0.5, 0, 0.5, 1] as const;

/** A layer's audio, ready to play on one context. */
export interface ILayerAssets {
  readonly bed: AudioBuffer;
  /** Loop window in seconds; the whole buffer for procedural beds. */
  readonly loopStart: number;
  readonly loopEnd: number;
  readonly grains: { readonly buffers: AudioBuffer[]; readonly spec: GrainSpec } | null;
}

export type LayerLoader = (context: BaseAudioContext, id: AmbientLayerId) => Promise<ILayerAssets>;

export interface IAmbientEngine {
  /** Move toward a new target. Cheap to call often; it only acts on changes. */
  apply(target: AmbientTarget): void;
  /** The music graph was built or torn down; rebind (or drop) everything. */
  graphChanged(): void;
  dispose(): void;
}

interface IVoice {
  readonly id: AmbientLayerId;
  readonly gain: GainNode;
  readonly nodes: AudioNode[];
  sources: AudioBufferSourceNode[];
  grainBuses: StereoPannerNode[];
  /** Grains scheduled but not yet finished; stopped with the voice. */
  readonly pendingGrains: Set<AudioBufferSourceNode>;
  assets: ILayerAssets | null;
  nextGrainAt: number;
  /** Set once the layer is ramping out; the voice is dropped when the timer fires. */
  stopTimer: ReturnType<typeof setTimeout> | null;
  /**
   * The gain this voice was last ramped to, or null before its buffer is in.
   * An unchanged target must schedule nothing: the driver re-evaluates on
   * every playback-store write, and re-ramping would cancel a running ease-in
   * and pile automation events up all night.
   */
  level: number | null;
}

const IDLE_TARGET: AmbientTarget = {
  mode: 'idle',
  gains: { rain: 0, vinyl: 0, noise: 0, fire: 0, cafe: 0 },
  sleepFadeSeconds: 0,
  keepBuffers: false,
};

/** Give the main thread a breath between layers: each render is a few ms of work. */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function toAudioBuffer(context: BaseAudioContext, samples: Float32Array): AudioBuffer {
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  return buffer;
}

/** Render a procedural layer, or fetch and decode the café loop. */
export const loadLayer: LayerLoader = async (context, id) => {
  if (id === 'cafe') {
    const response = await fetch(cafeLoopUrl);
    if (!response.ok) throw new Error(`cafe loop: HTTP ${response.status}`);
    const bed = await context.decodeAudioData(await response.arrayBuffer());
    return {
      bed,
      loopStart: CAFE_PAD_SECONDS,
      loopEnd: CAFE_PAD_SECONDS + CAFE_LOOP_SECONDS,
      grains: null,
    };
  }
  await yieldToEventLoop();
  const rendered = PROCEDURAL_RENDERERS[id](context.sampleRate, seededRandom(LAYER_SEEDS[id]));
  const bed = toAudioBuffer(context, rendered.bed);
  return {
    bed,
    loopStart: 0,
    loopEnd: bed.duration,
    grains: rendered.grains
      ? {
          buffers: rendered.grains.variants.map(v => toAudioBuffer(context, v)),
          spec: rendered.grains,
        }
      : null,
  };
};

/** Ramp a param from wherever it is now, cancelling anything scheduled. */
function rampTo(param: AudioParam, value: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

function disconnectAll(nodes: readonly AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

function logUniform(min: number, max: number): number {
  return min * (max / min) ** Math.random();
}

class AmbientEngine implements IAmbientEngine {
  private bus: AmbientBusHandle | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Map<AmbientLayerId, IVoice>();
  /** Loads in flight or done, for `assetsContext`. */
  private readonly assets = new Map<AmbientLayerId, Promise<ILayerAssets>>();
  private assetsContext: BaseAudioContext | null = null;
  private target: AmbientTarget = IDLE_TARGET;
  /** The mode the master gain was last driven to. */
  private masterMode: AmbientTarget['mode'] = 'idle';
  private teardownTimer: ReturnType<typeof setTimeout> | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly load: LayerLoader) {}

  apply(target: AmbientTarget): void {
    if (this.disposed) return;
    this.target = target;

    if (target.mode === 'idle') {
      this.fadeOutAndStop();
      return;
    }

    const bus = this.ensureBus();
    if (!bus || !this.master) return;
    this.cancelTeardown();
    const now = bus.context.currentTime;

    for (const id of AMBIENT_LAYER_IDS) this.applyLayer(id, target.gains[id], now);
    this.syncScheduler();

    if (target.mode === 'sleep' && this.masterMode !== 'sleep') {
      this.startSleepFade(this.master.gain, now, target.sleepFadeSeconds);
    } else if (target.mode === 'play' && this.masterMode !== 'play') {
      rampTo(this.master.gain, 1, now, FADE_IN_SECONDS);
    }
    this.masterMode = target.mode;
  }

  graphChanged(): void {
    // Built or torn down, the graph we were wired into is not the one that
    // exists now: drop every node without fading (a closing context cannot
    // play a fade anyway) and rebuild on the current graph if there is one.
    this.teardown({ releaseBus: false });
    if (this.target.mode !== 'idle') this.apply(this.target);
  }

  dispose(): void {
    this.teardown({ releaseBus: true });
    this.assets.clear();
    this.disposed = true;
  }

  private ensureBus(): AmbientBusHandle | null {
    if (this.bus && this.master) return this.bus;
    const handle = acquireAmbientBus();
    if (!handle) return null;
    if (handle.context !== this.assetsContext) {
      this.assets.clear();
      this.assetsContext = handle.context;
    }
    this.bus = handle;
    this.master = handle.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(handle.input);
    this.masterMode = 'idle';
    return handle;
  }

  private applyLayer(id: AmbientLayerId, gain: number, now: number): void {
    const voice = this.voices.get(id);
    if (gain > 0) {
      const live = voice ?? this.createVoice(id);
      if (live.stopTimer !== null) {
        clearTimeout(live.stopTimer);
        live.stopTimer = null;
      }
      if (live.assets && live.level !== gain) {
        rampTo(live.gain.gain, gain, now, LEVEL_RAMP_SECONDS);
        live.level = gain;
      }
      return;
    }
    if (!voice || voice.stopTimer !== null) return;
    rampTo(voice.gain.gain, 0, now, LEVEL_RAMP_SECONDS);
    voice.level = 0;
    voice.stopTimer = setTimeout(
      () => this.dropVoice(id),
      LEVEL_RAMP_SECONDS * 1000 + TEARDOWN_GRACE_MS
    );
  }

  private createVoice(id: AmbientLayerId): IVoice {
    const master = this.master;
    const context = this.bus?.context;
    if (!master || !context) throw new Error('ambience voice without a bus');
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const voice: IVoice = {
      id,
      gain,
      nodes: [gain],
      sources: [],
      grainBuses: [],
      pendingGrains: new Set(),
      assets: null,
      nextGrainAt: 0,
      stopTimer: null,
      level: null,
    };
    this.voices.set(id, voice);

    const pending = this.assetsFor(context, id);
    pending
      .then(assets => {
        if (this.voices.get(id) !== voice || this.bus?.context !== context) return;
        this.startVoice(voice, context, assets);
      })
      .catch((error: unknown) => {
        if (this.assets.get(id) === pending) this.assets.delete(id);
        // Drop the empty voice too, so the next target that wants it retries.
        if (this.voices.get(id) === voice) this.dropVoice(id);
        logger.warn(`[ambience] layer "${id}" failed to load`, error);
      });
    return voice;
  }

  private assetsFor(context: BaseAudioContext, id: AmbientLayerId): Promise<ILayerAssets> {
    let pending = this.assets.get(id);
    if (!pending) {
      pending = this.load(context, id);
      this.assets.set(id, pending);
    }
    return pending;
  }

  private startVoice(voice: IVoice, context: BaseAudioContext, assets: ILayerAssets): void {
    voice.assets = assets;
    const width = BED_WIDTH[voice.id];
    const loopLength = assets.loopEnd - assets.loopStart;
    const now = context.currentTime;

    for (const [index, pan] of [-width, width].entries()) {
      const source = context.createBufferSource();
      source.buffer = assets.bed;
      source.loop = true;
      source.loopStart = assets.loopStart;
      source.loopEnd = assets.loopEnd;
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      source.connect(panner);
      panner.connect(voice.gain);
      source.start(now, assets.loopStart + index * SECOND_VOICE_OFFSET * loopLength);
      voice.sources.push(source);
      voice.nodes.push(source, panner);
    }

    if (assets.grains) {
      for (const position of GRAIN_PAN_POSITIONS) {
        const bus = context.createStereoPanner();
        bus.pan.value = position * assets.grains.spec.spread;
        bus.connect(voice.gain);
        voice.grainBuses.push(bus);
        voice.nodes.push(bus);
      }
      voice.nextGrainAt = now + Math.random() / assets.grains.spec.ratePerSecond;
    }

    const gain = this.target.gains[voice.id];
    if (gain > 0) {
      rampTo(voice.gain.gain, gain, now, LATE_START_SECONDS);
      voice.level = gain;
    }
  }

  private dropVoice(id: AmbientLayerId): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    if (voice.stopTimer !== null) clearTimeout(voice.stopTimer);
    for (const source of [...voice.sources, ...voice.pendingGrains]) {
      try {
        source.stop();
      } catch {
        /* never started */
      }
    }
    disconnectAll([...voice.nodes, ...voice.pendingGrains]);
    voice.pendingGrains.clear();
    this.voices.delete(id);
  }

  /**
   * Follow the music's sleep fade with the same equal-power curve the audio
   * engine applies to the active deck, from wherever the master is now.
   */
  private startSleepFade(param: AudioParam, now: number, seconds: number): void {
    const from = param.value;
    const curve = new Float32Array(SLEEP_CURVE_POINTS);
    for (let i = 0; i < SLEEP_CURVE_POINTS; i++) {
      curve[i] = from * sleepFadeCurve(i / (SLEEP_CURVE_POINTS - 1));
    }
    param.cancelScheduledValues(now);
    param.setValueCurveAtTime(curve, now, seconds);
  }

  private fadeOutAndStop(): void {
    if (!this.bus || !this.master) {
      if (!this.target.keepBuffers) this.assets.clear();
      return;
    }
    if (this.teardownTimer !== null) return;
    const now = this.bus.context.currentTime;
    rampTo(this.master.gain, 0, now, FADE_OUT_SECONDS);
    this.masterMode = 'idle';
    this.teardownTimer = setTimeout(
      () => {
        this.teardownTimer = null;
        this.teardown({ releaseBus: true });
        if (!this.target.keepBuffers) this.assets.clear();
      },
      FADE_OUT_SECONDS * 1000 + TEARDOWN_GRACE_MS
    );
  }

  private cancelTeardown(): void {
    if (this.teardownTimer === null) return;
    clearTimeout(this.teardownTimer);
    this.teardownTimer = null;
  }

  private teardown({ releaseBus }: { releaseBus: boolean }): void {
    this.cancelTeardown();
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    for (const id of [...this.voices.keys()]) this.dropVoice(id);
    if (this.master) disconnectAll([this.master]);
    this.master = null;
    if (this.bus && releaseBus) releaseAmbientBus();
    this.bus = null;
    this.masterMode = 'idle';
  }

  /** Run the grain timer only while some grain layer is (or is about to be) audible. */
  private syncScheduler(): void {
    const wanted = [...this.voices.values()].some(
      v => GRAIN_LAYERS.has(v.id) && v.stopTimer === null
    );
    if (wanted && this.schedulerTimer === null) {
      this.schedulerTimer = setInterval(() => this.scheduleGrains(), SCHEDULER_INTERVAL_MS);
      this.scheduleGrains();
    } else if (!wanted && this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /** Place every grain due before the lookahead horizon, Poisson-spaced. */
  private scheduleGrains(): void {
    const context = this.bus?.context;
    if (!context) return;
    const now = context.currentTime;
    const horizon = now + SCHEDULE_AHEAD_SECONDS;

    for (const voice of this.voices.values()) {
      const grains = voice.assets?.grains;
      if (!grains || voice.stopTimer !== null || voice.grainBuses.length === 0) continue;
      const { spec, buffers } = grains;
      // After a throttled stretch, pick up from now rather than firing a burst
      // of everything that was missed.
      if (voice.nextGrainAt < now) voice.nextGrainAt = now + Math.random() * 0.05;
      while (voice.nextGrainAt < horizon) {
        this.playGrain(context, voice, buffers, spec, voice.nextGrainAt);
        voice.nextGrainAt += -Math.log(1 - Math.random()) / spec.ratePerSecond;
      }
    }
  }

  private playGrain(
    context: BaseAudioContext,
    voice: IVoice,
    buffers: readonly AudioBuffer[],
    spec: GrainSpec,
    at: number
  ): void {
    const source = context.createBufferSource();
    source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    source.playbackRate.value = spec.pitch[0] + Math.random() * (spec.pitch[1] - spec.pitch[0]);
    const gain = context.createGain();
    gain.gain.value = logUniform(spec.gain[0], spec.gain[1]);
    const bus = voice.grainBuses[Math.floor(Math.random() * voice.grainBuses.length)];
    source.connect(gain);
    gain.connect(bus);
    voice.pendingGrains.add(source);
    source.onended = () => {
      voice.pendingGrains.delete(source);
      disconnectAll([source, gain]);
    };
    source.start(at);
  }
}

export function createAmbientEngine(load: LayerLoader = loadLayer): IAmbientEngine {
  return new AmbientEngine(load);
}
