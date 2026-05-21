/**
 * Frame-rate cap for the audio visualizers. Audio bars read smooth at 30fps,
 * so there's no reason to redraw them at the monitor's refresh rate (60/120/144Hz).
 * On a 144Hz display this cuts visualizer draw work by ~4.8x.
 */
export const VISUALIZER_FPS = 30;

export interface FrequencySource {
  /**
   * Fills `buf` with frequency data; returns true if data was written.
   * Must be callable without `this` binding (close over state lexically).
   */
  read: (buf: Uint8Array<ArrayBufferLike>) => boolean;
  /** The length the caller should allocate for `buf`. */
  binCount: number;
}
