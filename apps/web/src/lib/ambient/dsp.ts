/**
 * Offline DSP building blocks for the ambience layers.
 *
 * Everything here runs once, on the main thread, when a layer is first heard:
 * it writes plain Float32Arrays that the engine then loops with
 * AudioBufferSourceNodes. Baking the texture ahead of time keeps the audio
 * thread's steady-state cost at "play a buffer", with no per-sample script,
 * no AudioWorklet module to ship through the CSP and nothing to keep warm.
 *
 * Every generator takes an explicit `Rng`, so a recipe fed the same seed and
 * sample rate renders the same samples. Tests rely on that, and so does the
 * café loop script under `scripts/ambient/`.
 */

/** A uniform [0, 1) source. Recipes pass a seeded one, never `Math.random`. */
export type Rng = () => number;

const TWO_PI = Math.PI * 2;

/** Uniform in [-1, 1). */
export function white(rng: Rng): number {
  return rng() * 2 - 1;
}

/** Uniform in [min, max). */
export function between(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/**
 * Exponential waiting time for a Poisson process of `ratePerSecond` events.
 * The `1 - rng()` keeps the log argument above zero.
 */
export function poissonGap(rng: Rng, ratePerSecond: number): number {
  return -Math.log(1 - rng()) / ratePerSecond;
}

/**
 * Pink (1/f) noise via Paul Kellet's economy three-pole filter. Pink rather
 * than white is what makes a wash read as "air" instead of "static": equal
 * energy per octave, so the top end is not doing all the talking.
 */
export function pinkNoise(rng: Rng, length: number): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const w = white(rng);
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return out;
}

/**
 * Brown (1/f²) noise: leaky-integrated white. The leak (÷1.02) stops the walk
 * from drifting into DC; the ×3.5 brings it back to roughly unit scale.
 */
export function brownNoise(rng: Rng, length: number): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * white(rng)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

export function whiteNoise(rng: Rng, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = white(rng);
  return out;
}

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass';

/**
 * In-place RBJ cookbook biquad (the same response curves a BiquadFilterNode
 * draws), direct form I. Returns `x` for chaining.
 */
export function biquad(
  x: Float32Array,
  type: BiquadType,
  freq: number,
  q: number,
  sampleRate: number
): Float32Array {
  const w0 = (TWO_PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    // Constant 0 dB peak gain, so a resonant band does not blow up the level.
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
  return x;
}

/** out += src × gain, sample for sample (lengths may differ; the overlap is used). */
export function mixInto(out: Float32Array, src: Float32Array, gain: number): Float32Array {
  const n = Math.min(out.length, src.length);
  for (let i = 0; i < n; i++) out[i] += src[i] * gain;
  return out;
}

/** Add `grain` into `out` starting at sample `at`, clipped to the buffer. */
export function addAt(out: Float32Array, grain: Float32Array, at: number, gain: number): void {
  const start = Math.max(0, Math.floor(at));
  const n = Math.min(grain.length, out.length - start);
  for (let i = 0; i < n; i++) out[start + i] += grain[i] * gain;
}

/**
 * A noise burst with an exponential decay: the atom of every click, tick and
 * pop in these recipes. `decayMs` is the time constant, `lengthMs` the hard
 * stop (a few time constants, so the tail is already inaudible there).
 */
export function noiseBurst(
  rng: Rng,
  sampleRate: number,
  lengthMs: number,
  decayMs: number
): Float32Array {
  const length = Math.max(2, Math.round((lengthMs / 1000) * sampleRate));
  const tau = (decayMs / 1000) * sampleRate;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = white(rng) * Math.exp(-i / tau);
  return out;
}

/**
 * Make `src` loop without a seam. `src` holds `loopLength` samples plus an
 * overhang; the overhang (what "would have come next") is equal-power
 * crossfaded into the head. Reading the result in a loop, the sample after the
 * last one is then (almost exactly) the continuation of the original signal,
 * so there is no click and no level dip at the wrap. Equal-power rather than
 * linear because the two ends are independent noise, which sums in power.
 */
export function foldSeam(src: Float32Array, loopLength: number): Float32Array {
  const fade = src.length - loopLength;
  if (fade <= 0) throw new Error('foldSeam needs an overhang past loopLength');
  const out = src.slice(0, loopLength);
  for (let i = 0; i < fade; i++) {
    const t = ((i + 0.5) / fade) * Math.PI * 0.5;
    out[i] = src[i] * Math.sin(t) + src[loopLength + i] * Math.cos(t);
  }
  return out;
}

/** One sinusoidal component of a slow movement: whole cycles per loop, so it wraps cleanly. */
export interface Swell {
  cycles: number;
  depth: number;
  phase: number;
}

/**
 * Multiply `x` (one full loop) by 1 + Σ depth·sin(2π·cycles·t/T + phase).
 * Whole cycles per loop keep the envelope continuous across the wrap, so a
 * "breathing" bed never jumps in level at the loop point.
 */
export function applySwells(x: Float32Array, swells: readonly Swell[]): Float32Array {
  const n = x.length;
  for (let i = 0; i < n; i++) {
    let env = 1;
    for (const s of swells) env += s.depth * Math.sin((TWO_PI * s.cycles * i) / n + s.phase);
    x[i] *= Math.max(0, env);
  }
  return x;
}

export function rmsOf(x: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, x.length));
}

export function peakOf(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

/** Scale `x` in place to the given RMS level (dBFS). Silence stays silent. */
export function normalizeRms(x: Float32Array, targetDb: number): Float32Array {
  const rms = rmsOf(x);
  if (rms === 0) return x;
  const k = 10 ** (targetDb / 20) / rms;
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

/** Scale `x` in place so its largest sample sits at `peak`. */
export function normalizePeak(x: Float32Array, peak: number): Float32Array {
  const p = peakOf(x);
  if (p === 0) return x;
  const k = peak / p;
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

/**
 * Round a stray transient down without touching anything below `ceiling`.
 * Heavy-tailed click amplitudes are the point of a crackle, but one freak
 * sample should not decide the whole layer's normalisation or hit the
 * limiter every loop.
 */
export function softCeiling(x: Float32Array, ceiling: number): Float32Array {
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const a = Math.abs(v);
    if (a > ceiling) x[i] = Math.sign(v) * ceiling * (1 + Math.tanh(a / ceiling - 1) * 0.25);
  }
  return x;
}
