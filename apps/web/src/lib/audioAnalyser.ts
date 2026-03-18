/**
 * Singleton audio analyser module.
 *
 * Manages a single AudioContext + AnalyserNode connected to the app's
 * HTMLAudioElement. `createMediaElementSource` can only be called once
 * per element, so this module guards against duplicate calls.
 */

let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let connected = false;

/**
 * Lazily initialise the Web Audio graph and connect it to the given
 * audio element.  Safe to call multiple times — only the first call
 * with a new element actually wires things up.
 *
 * Must be called from a user-gesture context (click / keypress) so the
 * AudioContext is allowed to start.
 */
export function initAnalyser(audio: HTMLAudioElement): AnalyserNode {
  if (analyserNode && connected) return analyserNode;

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256; // 128 frequency bins
  analyserNode.smoothingTimeConstant = 0.8;

  if (!sourceNode) {
    sourceNode = audioContext.createMediaElementSource(audio);
  }

  // audio -> analyser -> destination (speakers)
  sourceNode.connect(analyserNode);
  analyserNode.connect(audioContext.destination);

  connected = true;
  return analyserNode;
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
  if (sourceNode && analyserNode) {
    try { sourceNode.disconnect(analyserNode); } catch { /* already disconnected */ }
  }
  if (analyserNode && audioContext) {
    try { analyserNode.disconnect(audioContext.destination); } catch { /* ok */ }
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
  }
  audioContext = null;
  analyserNode = null;
  sourceNode = null;
  connected = false;
}
