/**
 * Audio analyser module supporting dual-deck playback.
 *
 * Manages an AudioContext with two MediaElementSource nodes (one per deck),
 * each routed through a GainNode. Both feed into a shared AnalyserNode
 * so the visualizer sees the merged output during crossfade transitions.
 *
 * Volume is controlled via the GainNodes rather than HTMLAudioElement.volume,
 * which gives smooth crossfade ramps and consistent analyser readings.
 */

let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceA: MediaElementAudioSourceNode | null = null;
let sourceB: MediaElementAudioSourceNode | null = null;
let gainA: GainNode | null = null;
let gainB: GainNode | null = null;
let connected = false;

/**
 * Initialise the Web Audio graph with two audio elements (deck A and deck B).
 * Both are routed through GainNodes into a shared AnalyserNode.
 *
 * Must be called from a user-gesture context so the AudioContext can start.
 * Safe to call multiple times — only the first call wires things up.
 */
export function initAnalyser(
  audioA: HTMLAudioElement,
  audioB: HTMLAudioElement,
): AnalyserNode {
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

  // sourceA -> gainA -> analyser -> destination
  // sourceB -> gainB -> analyser -> destination
  sourceA.connect(gainA);
  sourceB.connect(gainB);
  gainA.connect(analyserNode);
  gainB.connect(analyserNode);
  analyserNode.connect(audioContext.destination);

  connected = true;
  return analyserNode;
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
 * Number of frequency bins (fftSize / 2).
 */
export function getFrequencyBinCount(): number {
  return analyserNode ? analyserNode.frequencyBinCount : 128;
}

/**
 * Tear down the audio graph. Called on app unmount.
 */
export function destroyAnalyser() {
  try { sourceA?.disconnect(); } catch { /* ok */ }
  try { sourceB?.disconnect(); } catch { /* ok */ }
  try { gainA?.disconnect(); } catch { /* ok */ }
  try { gainB?.disconnect(); } catch { /* ok */ }
  try { analyserNode?.disconnect(); } catch { /* ok */ }
  if (audioContext) {
    audioContext.close().catch(() => {});
  }
  audioContext = null;
  analyserNode = null;
  sourceA = null;
  sourceB = null;
  gainA = null;
  gainB = null;
  connected = false;
}
