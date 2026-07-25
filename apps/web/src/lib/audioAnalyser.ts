/**
 * Audio analyser module supporting dual-deck playback with a graphic EQ.
 *
 * Manages an AudioContext with two MediaElementSource nodes (one per deck),
 * each routed through a GainNode. Both feed into a shared mix point, then a
 * preamp, a dry/wet split, a safety limiter, and finally the shared
 * AnalyserNode so the visualizer sees the processed output during crossfade
 * transitions.
 *
 *   sourceA -> gainA ↘                    ┌-> dryGain -------------┐
 *                      mixGain -> preamp -┤                        ├-> limiter -> analyser -> destination
 *   sourceB -> gainB ↗                    └-> eq[0..9] -> eqGain --┘
 *
 * The 10 biquads are built lazily on the first EQ enable and are only wired
 * into the graph while the EQ is on. With the EQ off (the default) the dry
 * branch carries the whole signal and the filters sit outside the render
 * graph, so they cost the audio thread nothing. The preamp and the safety
 * limiter stay in the path in both states — the limiter also guards the
 * above-unity boosts loudness leveling can apply to a deck gain.
 *
 * Toggling crossfades dryGain ↔ eqGain over RAMP_SECONDS, and the branch is
 * only (dis)connected while its gain sits at 0, so switching is click-free in
 * both directions.
 *
 * Volume is controlled via the per-deck GainNodes rather than
 * HTMLAudioElement.volume, which gives smooth crossfade ramps and consistent
 * analyser readings.
 */

import { dbToLinear } from '@/lib/loudness';

/** 10 ISO-style bands used by the EQ chain. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/** Q for the 8 peaking filters (positions 1..8). */
const PEAKING_Q = 1.414;

/** Limiter safety parameters (after the dry/wet merge, before the analyser). */
const LIMITER_THRESHOLD_DB = -1;
const LIMITER_KNEE_DB = 0;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_S = 0.003;
const LIMITER_RELEASE_S = 0.25;

/** Ramp duration for click-free gain changes. */
const RAMP_SECONDS = 0.03;

/**
 * Delay (ms) between starting the wet→dry ramp and unwiring the EQ branch, so
 * the branch is always silent by the time it leaves the graph.
 */
const EQ_UNWIRE_DELAY_MS = RAMP_SECONDS * 1000 + 20;

let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceA: MediaElementAudioSourceNode | null = null;
let sourceB: MediaElementAudioSourceNode | null = null;
let gainA: GainNode | null = null;
let gainB: GainNode | null = null;
let mixGain: GainNode | null = null;
let preamp: GainNode | null = null;
let dryGain: GainNode | null = null;
let eqGain: GainNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
let limiter: DynamicsCompressorNode | null = null;
let connected = false;
/** True while the biquad branch is wired between the preamp and the limiter. */
let eqWired = false;
let eqUnwireTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialise the Web Audio graph with two audio elements (deck A and deck B).
 * Both are routed through GainNodes into the mix/preamp/dry/limiter chain and
 * on into a shared AnalyserNode. The 10-band EQ is NOT built here — see
 * `setEqEnabled`.
 *
 * Must be called from a user-gesture context so the AudioContext can start.
 * Safe to call multiple times — only the first call wires things up.
 */
export function initAnalyser(audioA: HTMLAudioElement, audioB: HTMLAudioElement): AnalyserNode {
  if (analyserNode && connected) return analyserNode;

  if (!audioContext) {
    audioContext = new AudioContext();
  }
  const ctx = audioContext;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.smoothingTimeConstant = 0.8;

  if (!sourceA) sourceA = ctx.createMediaElementSource(audioA);
  if (!sourceB) sourceB = ctx.createMediaElementSource(audioB);

  gainA = ctx.createGain();
  gainB = ctx.createGain();
  gainA.gain.value = 1;
  gainB.gain.value = 0;

  mixGain = ctx.createGain();
  mixGain.gain.value = 1;

  preamp = ctx.createGain();
  preamp.gain.value = 1; // 0 dB

  // Dry branch — carries the full signal whenever the EQ is off (the default).
  dryGain = ctx.createGain();
  dryGain.gain.value = 1;

  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMITER_THRESHOLD_DB;
  limiter.knee.value = LIMITER_KNEE_DB;
  limiter.ratio.value = LIMITER_RATIO;
  limiter.attack.value = LIMITER_ATTACK_S;
  limiter.release.value = LIMITER_RELEASE_S;

  sourceA.connect(gainA);
  sourceB.connect(gainB);
  gainA.connect(mixGain);
  gainB.connect(mixGain);
  mixGain.connect(preamp);
  preamp.connect(dryGain);
  dryGain.connect(limiter);
  limiter.connect(analyserNode);
  analyserNode.connect(ctx.destination);

  connected = true;
  return analyserNode;
}

/**
 * Build the 10 biquads and their wet gain on demand. Called the first time the
 * EQ is switched on, so users who never enable it never pay for the nodes.
 * Returns false when the graph isn't initialised yet.
 */
function ensureEqNodes(): boolean {
  if (eqNodes.length > 0 && eqGain) return true;
  if (!audioContext) return false;

  const ctx = audioContext;

  eqNodes = EQ_BANDS.map((freq, i) => {
    const node = ctx.createBiquadFilter();
    if (i === 0) {
      node.type = 'lowshelf';
    } else if (i === EQ_BANDS.length - 1) {
      node.type = 'highshelf';
    } else {
      node.type = 'peaking';
      node.Q.value = PEAKING_Q;
    }
    node.frequency.value = freq;
    node.gain.value = 0;
    return node;
  });

  // Starts silent so splicing the branch in is inaudible; setEqEnabled ramps it.
  eqGain = ctx.createGain();
  eqGain.gain.value = 0;

  let prev: AudioNode = eqNodes[0];
  for (let i = 1; i < eqNodes.length; i++) {
    prev.connect(eqNodes[i]);
    prev = eqNodes[i];
  }
  prev.connect(eqGain);

  return true;
}

/**
 * Drop the (already silent) EQ branch out of the render graph. The internal
 * eq[0]->..->eqGain wiring is left intact so re-enabling only has to reattach
 * the two edges — and the band gains survive the round trip.
 */
function unwireEq(): void {
  eqUnwireTimer = null;
  if (!eqWired) return;
  eqWired = false;

  // Pin the dry branch at unity in case the ramp was cut short (e.g. the
  // context was suspended mid-fade) so dropping the wet branch can't leave a
  // gain dip.
  if (dryGain && audioContext) {
    const t = audioContext.currentTime;
    dryGain.gain.cancelScheduledValues(t);
    dryGain.gain.setValueAtTime(1, t);
  }

  try {
    preamp?.disconnect(eqNodes[0]);
  } catch {
    /* ok */
  }
  try {
    if (limiter) eqGain?.disconnect(limiter);
  } catch {
    /* ok */
  }
}

/**
 * Smoothly ramp an AudioParam to a new value to avoid clicks/zipper noise.
 */
function rampParam(param: AudioParam, nextValue: number): void {
  if (!audioContext) return;
  const t = audioContext.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(nextValue, t + RAMP_SECONDS);
}

/**
 * Set the gain of a single EQ band (in dB). Silently no-ops if the filters
 * haven't been built yet (EQ never enabled) or the index is out of range.
 */
export function setEqBand(index: number, gainDb: number): void {
  const node = eqNodes[index];
  if (!node) return;
  rampParam(node.gain, gainDb);
}

/**
 * Apply a preset (array of 10 dB gains, in EQ_BANDS order). No-ops until the
 * filters exist — `setEqEnabled(true)` builds them, and the caller re-applies
 * the preset right after, so nothing is lost.
 */
export function applyEqPreset(gains: readonly number[]): void {
  const len = Math.min(gains.length, eqNodes.length);
  for (let i = 0; i < len; i++) {
    rampParam(eqNodes[i].gain, gains[i]);
  }
}

/**
 * Toggle the EQ on/off by crossfading between the dry branch and the biquad
 * branch. Enabling builds the filters on first use and splices them in while
 * their gain is still 0; disabling ramps them back out and unwires the branch
 * once it is silent, so the audio thread stops processing it entirely.
 *
 * Band gains are never reset here — they live on the (reused) filter nodes and
 * survive a disable/enable cycle. When enabling, the caller is still expected
 * to follow up with applyEqPreset(currentGains) so a freshly built chain picks
 * up the persisted configuration.
 */
export function setEqEnabled(enabled: boolean): void {
  if (!audioContext || !preamp || !limiter || !dryGain) return;

  if (eqUnwireTimer !== null) {
    clearTimeout(eqUnwireTimer);
    eqUnwireTimer = null;
  }

  if (enabled) {
    if (!ensureEqNodes() || !eqGain) return;
    if (!eqWired) {
      preamp.connect(eqNodes[0]);
      eqGain.connect(limiter);
      eqWired = true;
    }
    rampParam(eqGain.gain, 1);
    rampParam(dryGain.gain, 0);
    return;
  }

  if (!eqWired || !eqGain) return;
  rampParam(eqGain.gain, 0);
  rampParam(dryGain.gain, 1);
  eqUnwireTimer = setTimeout(unwireEq, EQ_UNWIRE_DELAY_MS);
}

/**
 * Set the preamp gain in dB (±12 recommended). Converted to linear gain. The
 * preamp sits ahead of the dry/wet split, so it applies in both EQ states.
 */
export function setPreampDb(db: number): void {
  if (!preamp) return;
  const linear = dbToLinear(db);
  rampParam(preamp.gain, linear);
}

/**
 * Set the gain (volume) for a specific deck.
 * Value should be 0-1 (will be clamped).
 */
export function setDeckGain(deck: 'A' | 'B', value: number) {
  const gain = deck === 'A' ? gainA : gainB;
  if (gain) {
    gain.gain.value = Math.max(0, Math.min(1, value));
  }
}

/**
 * Check whether the Web Audio graph has been initialised.
 */
export function isAnalyserReady(): boolean {
  return connected;
}

/**
 * Return the current AnalyserNode (or null if not yet initialised).
 */
export function getAnalyser(): AnalyserNode | null {
  return analyserNode;
}

/**
 * Copy the current frequency data into the provided Uint8Array.
 * Returns false if the analyser is not yet ready.
 */
export function getFrequencyData(buffer: Uint8Array<ArrayBuffer>): boolean {
  if (!analyserNode) return false;
  analyserNode.getByteFrequencyData(buffer);
  return true;
}

/**
 * Ensure the AudioContext is running. Call before any play() operation.
 * Once a MediaElementAudioSourceNode captures an element, ALL audio must
 * flow through the AudioContext. If it becomes suspended (Chromium power-
 * saving, tab backgrounding, etc.) audio is permanently lost until resumed.
 */
export function resumeAudioContext(): void {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

/**
 * Tear down the audio graph. Called on app unmount.
 */
export function destroyAnalyser() {
  if (eqUnwireTimer !== null) {
    clearTimeout(eqUnwireTimer);
    eqUnwireTimer = null;
  }
  try {
    sourceA?.disconnect();
  } catch {
    /* ok */
  }
  try {
    sourceB?.disconnect();
  } catch {
    /* ok */
  }
  try {
    gainA?.disconnect();
  } catch {
    /* ok */
  }
  try {
    gainB?.disconnect();
  } catch {
    /* ok */
  }
  try {
    mixGain?.disconnect();
  } catch {
    /* ok */
  }
  try {
    preamp?.disconnect();
  } catch {
    /* ok */
  }
  try {
    dryGain?.disconnect();
  } catch {
    /* ok */
  }
  try {
    eqGain?.disconnect();
  } catch {
    /* ok */
  }
  for (const node of eqNodes) {
    try {
      node.disconnect();
    } catch {
      /* ok */
    }
  }
  try {
    limiter?.disconnect();
  } catch {
    /* ok */
  }
  try {
    analyserNode?.disconnect();
  } catch {
    /* ok */
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
  }
  audioContext = null;
  analyserNode = null;
  sourceA = null;
  sourceB = null;
  gainA = null;
  gainB = null;
  mixGain = null;
  preamp = null;
  dryGain = null;
  eqGain = null;
  eqNodes = [];
  limiter = null;
  connected = false;
  eqWired = false;
}
