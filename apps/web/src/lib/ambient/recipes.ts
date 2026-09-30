/**
 * Sound design for the procedural ambience layers.
 *
 * Each layer is two parts:
 *
 *  - a **bed**: a short seamless loop rendered offline (see `dsp.ts`). It holds
 *    the continuous texture plus the dense, tiny events (drizzle, dust
 *    crackle) that are too many and too small for the ear to track, so the
 *    loop is not recognisable as one;
 *  - optional live **grains**: a handful of pre-rendered one-shots the engine
 *    scatters at random times, gains, pitches and pan positions. These are the
 *    events the ear *does* follow (a drip on the sill, a vinyl pop, a log
 *    snapping), and they never repeat in a pattern because they are never
 *    part of the loop.
 *
 * Budgets: beds stay at 8 to 10 s of mono float (under 2 MB each at 48 kHz),
 * well inside the 15 s-per-layer rule, and the engine plays each bed through
 * two offset voices for width instead of storing a second channel.
 *
 * Levels: beds are normalised to an RMS target per layer, so a slider at 100%
 * sits around -24 dBFS before the player volume, which keeps ambience under a
 * loudness-normalised track rather than competing with it.
 */

import {
  addAt,
  applySwells,
  between,
  biquad,
  brownNoise,
  foldSeam,
  mixInto,
  noiseBurst,
  normalizePeak,
  normalizeRms,
  pinkNoise,
  poissonGap,
  softCeiling,
  whiteNoise,
  type Rng,
} from './dsp';

/** Every procedural layer. The recorded café layer lives in `cafe.ts`. */
export type ProceduralLayerId = 'rain' | 'vinyl' | 'noise' | 'fire';

/** How the engine scatters a layer's live one-shots. */
export interface GrainSpec {
  /** Pre-rendered one-shots to pick from. */
  readonly variants: readonly Float32Array[];
  /** Mean events per second (Poisson). */
  readonly ratePerSecond: number;
  /** Per-event gain range, drawn log-uniformly (quiet events are commoner). */
  readonly gain: readonly [number, number];
  /** Per-event playbackRate range: small pitch spread so variants do not repeat exactly. */
  readonly pitch: readonly [number, number];
  /** Widest pan position used (0 = centre only, 1 = hard left/right). */
  readonly spread: number;
}

export interface RenderedLayer {
  /** One seamless loop of the bed, mono. */
  readonly bed: Float32Array;
  readonly grains: GrainSpec | null;
}

/** Overhang rendered past the loop for `foldSeam`, in seconds. */
const SEAM_SECONDS = 0.5;

/** Fixed seeds, one per layer, so a layer always renders the same bed. */
export const LAYER_SEEDS: Record<ProceduralLayerId, number> = {
  rain: 0x7a1e_2026,
  vinyl: 0x33_45_78,
  noise: 0xb0_0b_1e,
  fire: 0xf1_4e_00,
};

function lengths(sampleRate: number, loopSeconds: number) {
  const loop = Math.round(loopSeconds * sampleRate);
  return { loop, total: loop + Math.round(SEAM_SECONDS * sampleRate) };
}

/**
 * Scatter `rate` noise-burst events per second across `out`. Amplitude is
 * `min + (max - min)·u^skew`: a high skew makes most events whisper-quiet
 * with the odd louder one, which is how real drizzle and dust behave.
 */
function scatterBursts(
  rng: Rng,
  out: Float32Array,
  sampleRate: number,
  opts: {
    rate: number;
    lengthMs: readonly [number, number];
    amp: readonly [number, number];
    skew: number;
  }
): void {
  let t = poissonGap(rng, opts.rate);
  const seconds = out.length / sampleRate;
  while (t < seconds) {
    const len = between(rng, opts.lengthMs[0], opts.lengthMs[1]);
    const burst = noiseBurst(rng, sampleRate, len, len / 4);
    const amp = opts.amp[0] + (opts.amp[1] - opts.amp[0]) * rng() ** opts.skew;
    addAt(out, burst, t * sampleRate, amp);
    t += poissonGap(rng, opts.rate);
  }
}

/**
 * Rain on a window.
 *
 * Bed (10 s): a pink-noise wash band-limited to 350 Hz to 5.2 kHz (below that
 * it rumbles like wind, above it hisses like a radio), plus ~220 tiny drops a
 * second (1.5 to 5 ms bursts, high-passed to 1.5 kHz) that give the wash its
 * granular "patter". Three slow swells (1, 3 and 7 per loop) keep it breathing
 * without an audible period.
 *
 * Grains (~5/s): taps on glass (short noise bursts through a resonant
 * 1.8 to 4 kHz band) and a few soft drips (a damped sine gliding up 15%, the
 * way a bubble's pitch rises as it closes), scattered across the stereo field.
 */
export function renderRain(sampleRate: number, rng: Rng): RenderedLayer {
  const { loop, total } = lengths(sampleRate, 10);

  const wash = pinkNoise(rng, total);
  biquad(wash, 'highpass', 350, 0.7, sampleRate);
  biquad(wash, 'lowpass', 5200, 0.7, sampleRate);

  const patter = new Float32Array(total);
  scatterBursts(rng, patter, sampleRate, {
    rate: 220,
    lengthMs: [1.5, 5],
    amp: [0.05, 0.6],
    skew: 3,
  });
  biquad(patter, 'highpass', 1500, 0.7, sampleRate);
  biquad(patter, 'lowpass', 9000, 0.7, sampleRate);

  const mix = mixInto(wash, patter, 0.8);
  const bed = applySwells(foldSeam(mix, loop), [
    { cycles: 1, depth: 0.1, phase: 0 },
    { cycles: 3, depth: 0.05, phase: 1.3 },
    { cycles: 7, depth: 0.03, phase: 2.1 },
  ]);
  normalizeRms(bed, -26);

  const variants: Float32Array[] = [];
  for (let i = 0; i < 10; i++) {
    const len = between(rng, 6, 14);
    const tap = noiseBurst(rng, sampleRate, len, len / 5);
    biquad(tap, 'bandpass', between(rng, 1800, 4000), between(rng, 3, 6), sampleRate);
    variants.push(normalizePeak(tap, 1));
  }
  for (let i = 0; i < 4; i++) variants.push(renderDrip(rng, sampleRate));

  return {
    bed,
    grains: { variants, ratePerSecond: 5, gain: [0.015, 0.09], pitch: [0.85, 1.2], spread: 0.8 },
  };
}

/** A soft drip: damped sine rising in pitch, with a breath of noise on the attack. */
function renderDrip(rng: Rng, sampleRate: number): Float32Array {
  const length = Math.round(0.06 * sampleRate);
  const f0 = between(rng, 900, 1600);
  const tau = between(rng, 0.012, 0.025) * sampleRate;
  const out = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const f = f0 * (1 + (0.15 * i) / length);
    phase += (2 * Math.PI * f) / sampleRate;
    const attack = i < 48 ? (rng() * 2 - 1) * 0.3 * (1 - i / 48) : 0;
    out[i] = (Math.sin(phase) + attack) * Math.exp(-i / tau);
  }
  biquad(out, 'lowpass', 5000, 0.7, sampleRate);
  return normalizePeak(out, 1);
}

/** 33⅓ rpm: one revolution every 1.8 s. */
const VINYL_REVOLUTION_SECONDS = 60 / (100 / 3);

/**
 * Vinyl crackle.
 *
 * Bed (9 s = exactly five revolutions at 33⅓): surface hiss (white noise
 * band-limited to 3 to 10 kHz, kept well down), a whisper of low motor rumble
 * under 90 Hz for warmth, and ~30 dust clicks a second with a heavy-tailed
 * level (sub-millisecond bursts, high-passed to 800 Hz). One small scratch
 * ticks once per revolution at the same spot, the way a real record does, so
 * the one thing that *does* repeat is supposed to.
 *
 * Grains (~0.8/s): bigger, rounder pops (2 to 6 ms, low-passed to 2.5 kHz so
 * they thump rather than snap).
 */
export function renderVinyl(sampleRate: number, rng: Rng): RenderedLayer {
  const loopSeconds = VINYL_REVOLUTION_SECONDS * 5;
  const { loop, total } = lengths(sampleRate, loopSeconds);

  const hiss = whiteNoise(rng, total);
  biquad(hiss, 'highpass', 3000, 0.7, sampleRate);
  biquad(hiss, 'lowpass', 10000, 0.7, sampleRate);

  const rumble = brownNoise(rng, total);
  biquad(rumble, 'lowpass', 90, 0.7, sampleRate);

  const dust = new Float32Array(total);
  scatterBursts(rng, dust, sampleRate, {
    rate: 30,
    lengthMs: [0.3, 1.2],
    amp: [0.03, 1],
    skew: 6,
  });
  biquad(dust, 'highpass', 800, 0.7, sampleRate);

  const bed = foldSeam(mixInto(mixInto(dust, hiss, 0.05), rumble, 0.04), loop);

  // The per-revolution scratch is added after folding, at exact revolution
  // offsets inside the loop, so its period survives the wrap untouched.
  const scratch = noiseBurst(rng, sampleRate, 1.5, 0.35);
  biquad(scratch, 'bandpass', 2400, 1.5, sampleRate);
  normalizePeak(scratch, 0.35);
  const phase = 0.37 * VINYL_REVOLUTION_SECONDS;
  for (let rev = 0; rev < 5; rev++) {
    addAt(bed, scratch, (phase + rev * VINYL_REVOLUTION_SECONDS) * sampleRate, 1);
  }

  // Level first, then round off the rare huge click: dust is heavy-tailed by
  // design, and without the ceiling one freak click would peak near 0 dBFS.
  normalizeRms(bed, -30);
  softCeiling(bed, 0.35);

  const variants: Float32Array[] = [];
  for (let i = 0; i < 8; i++) {
    const len = between(rng, 2, 6);
    const pop = noiseBurst(rng, sampleRate, len, len / 3);
    biquad(pop, 'lowpass', i < 6 ? 2500 : 5000, 0.7, sampleRate);
    variants.push(normalizePeak(pop, 1));
  }

  return {
    bed,
    grains: { variants, ratePerSecond: 0.8, gain: [0.03, 0.14], pitch: [0.8, 1.25], spread: 0.3 },
  };
}

/**
 * Warm noise: the "fan in the next room" bed.
 *
 * Bed (8 s): mostly brown noise with a quarter of pink for a little air,
 * rolled off above ~1 kHz and high-passed at 30 Hz so the brown walk cannot
 * push sub-bass energy into the limiter. One very slow swell per loop (±6%)
 * keeps it from sounding like a test tone. No grains: its job is to be
 * uneventful.
 */
export function renderNoise(sampleRate: number, rng: Rng): RenderedLayer {
  const { loop, total } = lengths(sampleRate, 8);

  const air = pinkNoise(rng, total);
  biquad(air, 'lowpass', 1200, 0.7, sampleRate);
  const body = mixInto(brownNoise(rng, total), air, 0.25 / 0.75);
  biquad(body, 'lowpass', 1000, 0.6, sampleRate);
  biquad(body, 'highpass', 30, 0.7, sampleRate);

  const bed = applySwells(foldSeam(body, loop), [{ cycles: 1, depth: 0.06, phase: 0 }]);
  normalizeRms(bed, -24);
  return { bed, grains: null };
}

/**
 * Fireplace.
 *
 * Bed (10 s), three strands folded separately so each keeps its own
 * movement: a low roar (brown noise under 220 Hz, swelling slowly by up to
 * ±25%), the flame itself (pink noise in a broad band around 900 Hz,
 * flickering at roughly 2 to 5 Hz), and embers (small clusters of one to five
 * bright clicks, about three clusters a second).
 *
 * Grains (~1.1/s): the snaps you notice. Each is a burst of two to seven
 * clicks over 10 to 60 ms riding a short resonant "crack" in the 1.2 to
 * 2.5 kHz band, with a few low thumps (a log settling) mixed in.
 */
export function renderFire(sampleRate: number, rng: Rng): RenderedLayer {
  const { loop, total } = lengths(sampleRate, 10);

  const roar = brownNoise(rng, total);
  biquad(roar, 'lowpass', 220, 0.7, sampleRate);
  const roarLoop = applySwells(normalizeRms(foldSeam(roar, loop), -24), [
    { cycles: 1, depth: 0.25, phase: 0.4 },
    { cycles: 2, depth: 0.12, phase: 2.2 },
    { cycles: 5, depth: 0.06, phase: 4.1 },
  ]);

  const flame = pinkNoise(rng, total);
  biquad(flame, 'bandpass', 900, 0.6, sampleRate);
  const flameLoop = applySwells(normalizeRms(foldSeam(flame, loop), -30), [
    { cycles: 23, depth: 0.15, phase: 0 },
    { cycles: 37, depth: 0.12, phase: 1.7 },
    { cycles: 51, depth: 0.1, phase: 3.3 },
  ]);

  const embers = new Float32Array(total);
  let t = poissonGap(rng, 3);
  while (t < total / sampleRate) {
    const clicks = 1 + Math.floor(rng() * 5);
    const span = between(rng, 0.005, 0.04);
    for (let c = 0; c < clicks; c++) {
      const len = between(rng, 0.2, 0.8);
      addAt(
        embers,
        noiseBurst(rng, sampleRate, len, len / 3),
        (t + rng() * span) * sampleRate,
        between(rng, 0.1, 0.6)
      );
    }
    t += poissonGap(rng, 3);
  }
  biquad(embers, 'highpass', 2000, 0.7, sampleRate);
  const emberLoop = normalizeRms(foldSeam(embers, loop), -32);

  const bed = mixInto(mixInto(roarLoop, flameLoop, 1), emberLoop, 1);
  normalizeRms(bed, -26);
  softCeiling(bed, 0.4);

  const variants: Float32Array[] = [];
  for (let i = 0; i < 8; i++) variants.push(renderSnap(rng, sampleRate));
  for (let i = 0; i < 3; i++) {
    const thump = noiseBurst(rng, sampleRate, 40, 12);
    biquad(thump, 'lowpass', 400, 0.8, sampleRate);
    variants.push(normalizePeak(thump, 1));
  }

  return {
    bed,
    grains: { variants, ratePerSecond: 1.1, gain: [0.03, 0.16], pitch: [0.85, 1.2], spread: 0.6 },
  };
}

/** A wood snap: a click cluster over a short resonant crack. */
function renderSnap(rng: Rng, sampleRate: number): Float32Array {
  const spanMs = between(rng, 10, 60);
  const out = new Float32Array(Math.round(((spanMs + 45) / 1000) * sampleRate));
  const clicks = 2 + Math.floor(rng() * 6);
  for (let c = 0; c < clicks; c++) {
    const len = between(rng, 0.3, 1.2);
    addAt(
      out,
      noiseBurst(rng, sampleRate, len, len / 3),
      ((rng() * spanMs) / 1000) * sampleRate,
      between(rng, 0.4, 1)
    );
  }
  const decay = between(rng, 20, 40);
  const crack = noiseBurst(rng, sampleRate, decay * 2, decay / 2);
  biquad(crack, 'bandpass', between(rng, 1200, 2500), 2, sampleRate);
  addAt(out, normalizePeak(crack, 1), 0, 0.5);
  biquad(out, 'highpass', 300, 0.7, sampleRate);
  return normalizePeak(out, 1);
}

export const PROCEDURAL_RENDERERS: Record<
  ProceduralLayerId,
  (sampleRate: number, rng: Rng) => RenderedLayer
> = {
  rain: renderRain,
  vinyl: renderVinyl,
  noise: renderNoise,
  fire: renderFire,
};
