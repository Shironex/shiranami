export interface FrequencySource {
  /**
   * Fills `buf` with frequency data; returns true if data was written.
   * Must be callable without `this` binding (close over state lexically).
   */
  read: (buf: Uint8Array<ArrayBufferLike>) => boolean;
  /** The length the caller should allocate for `buf`. */
  binCount: number;
}
