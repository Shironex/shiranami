/**
 * Tempo-locked breathing — the calm math (the feature wave's tempo research).
 *
 * A track's stored BPM becomes a set of slow animation periods published as
 * CSS custom properties on `<html>`. Every consumer keyframe declares its
 * pre-breathing fixed period as the `var()` fallback, so a missing property
 * (no BPM, toggle off, reduced motion, low-perf) is exactly the old app.
 *
 * The calm rules are hard requirements: each surface's period is a bar
 * multiple folded by octaves (doubled/halved) into a per-surface window
 * anchored on that surface's original fixed duration, so a fast track can
 * never strobe — it just breathes at half or quarter time.
 */

/** Custom properties published while breathing is active. */
export const BEAT_PROPS = {
  /** One beat, seconds — the raw `--beat-duration` primitive. */
  beat: '--beat-duration',
  /** The artwork bloom's swell period (bar-anchored). */
  bloom: '--breath-bloom',
  /** The mascot float period (anchored on the 6s float). */
  float: '--breath-float',
  /** The compact player's pulse period (anchored on the 3s pulse). */
  pulse: '--breath-pulse',
} as const;

/**
 * Stored BPM outside this window is treated as absent. The analyzer already
 * folds into 60-180, so anything else is a foreign or corrupt row — falling
 * back to the fixed periods is safer than breathing at a wrong rate.
 */
const BPM_MIN = 30;
const BPM_MAX = 300;

/** Lofi is overwhelmingly 4/4; the bar is the breathing unit the research names. */
const BEATS_PER_BAR = 4;

/** One breathing period per surface, in seconds. */
export interface IBreathingPeriods {
  readonly beat: number;
  readonly bloom: number;
  readonly float: number;
  readonly pulse: number;
}

/**
 * Fold a period by octaves into `[min, max)`. Both windows used here span an
 * exact 2x ratio, so folding always terminates in-band; the final clamp is a
 * guard against a caller passing a narrower window.
 */
export function foldPeriodIntoBand(seconds: number, min: number, max: number): number {
  let period = seconds;
  while (period < min) period *= 2;
  while (period >= max) period /= 2;
  return period < min ? min : period;
}

/** Round to centiseconds so the published property strings stay stable. */
function calm(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

/**
 * Derive the breathing periods for a stored BPM, or `null` when the value is
 * absent or implausible (the caller then publishes nothing and every surface
 * keeps its fixed period).
 *
 * Anchors: the bloom swells once a bar (two or four bars for fast tracks),
 * the mascot float folds around its original 6s, the pulse around its 3s.
 */
export function breathingPeriods(bpm: number | null | undefined): IBreathingPeriods | null {
  if (bpm == null || !Number.isFinite(bpm)) return null;
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
  const beat = 60 / bpm;
  const bar = beat * BEATS_PER_BAR;
  return {
    beat: calm(beat),
    bloom: calm(foldPeriodIntoBand(bar, 3, 6)),
    float: calm(foldPeriodIntoBand(bar, 4.5, 9)),
    pulse: calm(foldPeriodIntoBand(bar, 2, 4)),
  };
}
