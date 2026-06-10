/**
 * Audio analyser module supporting dual-deck playback with a graphic EQ.
 *
 * Manages an AudioContext with two MediaElementSource nodes (one per deck),
 * each routed through a GainNode. Both feed into a shared mix point, then
 * through a preamp, a 10-band biquad EQ chain, a safety limiter, and finally
 * the shared AnalyserNode so the visualizer sees the processed output during
 * crossfade transitions.
 *
 *   sourceA -> gainA ↘
 *                      mixGain -> preamp -> eq[0..9] -> limiter -> analyser -> destination
 *   sourceB -> gainB ↗
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

/** Limiter safety parameters (after the EQ, before the analyser). */
const LIMITER_THRESHOLD_DB = -1;
const LIMITER_KNEE_DB = 0;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_S = 0.003;
const LIMITER_RELEASE_S = 0.25;

/** Ramp duration for click-free gain changes. */
const RAMP_SECONDS = 0.03;

let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceA: MediaElementAudioSourceNode | null = null;
let sourceB: MediaElementAudioSourceNode | null = null;
let gainA: GainNode | null = null;
let gainB: GainNode | null = null;
let mixGain: GainNode | null = null;
let preamp: GainNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
let limiter: DynamicsCompressorNode | null = null;
let connected = false;
let eqReady = false;

/**
 * Initialise the Web Audio graph with two audio elements (deck A and deck B).
 * Both are routed through GainNodes into a shared AnalyserNode.
 *
 * Must be called from a user-gesture context so the AudioContext can start.
 * Safe to call multiple times — only the first call wires things up.
 */
export function initAnalyser(audioA: HTMLAudioElement, audioB: HTMLAudioElement): AnalyserNode {
  if (analyserNode && connected) return analyserNode;

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.smoothingTimeConstant = 0.8;

  if (!sourceA) sourceA = audioContext.createMediaElementSource(audioA);
  if (!sourceB) sourceB = audioContext.createMediaElementSource(audioB);

  gainA = audioContext.createGain();
  gainB = audioContext.createGain();
  gainA.gain.value = 1;
  gainB.gain.value = 0;

  sourceA.connect(gainA);
  sourceB.connect(gainB);

  // Initially the two deck gains feed the analyser directly. initEq() will
  // rewire them through the mix/preamp/EQ/limiter chain on first call.
  gainA.connect(analyserNode);
  gainB.connect(analyserNode);
  analyserNode.connect(audioContext.destination);

  connected = true;
  return analyserNode;
}

/**
 * Build the EQ chain and rewire the two deck gains through it. Safe to call
 * multiple times — subsequent calls are no-ops.
 *
 * Topology after this call:
 *   gainA -> mixGain -> preamp -> eq[0..9] -> limiter -> analyser -> destination
 *   gainB ↗
 */
export function initEq(): void {
  if (eqReady) return;
  if (!audioContext || !analyserNode || !gainA || !gainB) return;

  const ctx = audioContext;

  mixGain = ctx.createGain();
  mixGain.gain.value = 1;

  preamp = ctx.createGain();
  preamp.gain.value = 1; // 0 dB

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

  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMITER_THRESHOLD_DB;
  limiter.knee.value = LIMITER_KNEE_DB;
  limiter.ratio.value = LIMITER_RATIO;
  limiter.attack.value = LIMITER_ATTACK_S;
  limiter.release.value = LIMITER_RELEASE_S;

  // Detach the per-deck gains from the analyser — they now feed the chain.
  try {
    gainA.disconnect(analyserNode);
  } catch {
    /* ok */
  }
  try {
    gainB.disconnect(analyserNode);
  } catch {
    /* ok */
  }

  // Wire the chain.
  gainA.connect(mixGain);
  gainB.connect(mixGain);
  mixGain.connect(preamp);

  let prev: AudioNode = preamp;
  for (const node of eqNodes) {
    prev.connect(node);
    prev = node;
  }
  prev.connect(limiter);
  limiter.connect(analyserNode);

  eqReady = true;
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
 * Set the gain of a single EQ band (in dB). Silently no-ops if the chain is
 * not ready yet or the index is out of range.
 */
export function setEqBand(index: number, gainDb: number): void {
  if (!eqReady) return;
  const node = eqNodes[index];
  if (!node) return;
  rampParam(node.gain, gainDb);
}

/**
 * Apply a preset (array of 10 dB gains, in EQ_BANDS order).
 */
export function applyEqPreset(gains: readonly number[]): void {
  if (!eqReady) return;
  const len = Math.min(gains.length, eqNodes.length);
  for (let i = 0; i < len; i++) {
    rampParam(eqNodes[i].gain, gains[i]);
  }
}

/**
 * Toggle the EQ on/off. Instead of disconnecting nodes (which causes a small
 * pop) we simply ramp every band's gain to 0 dB when disabled. The chain
 * remains wired and the preamp/limiter stay in place.
 */
export function setEqEnabled(enabled: boolean): void {
  if (!eqReady) return;
  if (!enabled) {
    for (const node of eqNodes) rampParam(node.gain, 0);
  }
  // When enabling, the caller is expected to immediately follow up with
  // applyEqPreset(currentGains) to restore the user's configuration.
}

/**
 * Set the preamp gain in dB (±12 recommended). Converted to linear gain.
 */
export function setPreampDb(db: number): void {
  if (!eqReady || !preamp) return;
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
  eqNodes = [];
  limiter = null;
  connected = false;
  eqReady = false;
}
