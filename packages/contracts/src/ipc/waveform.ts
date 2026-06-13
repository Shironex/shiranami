// Wire types for the waveform-peaks IPC surface.
//
// The native addon (apps/desktop/src/native) decodes a local audio file
// (.wav/.flac/.mp3) and reduces it to a fixed-length array of peak amplitudes
// for the player's waveform seekbar. Peaks are content-addressed and cached on
// disk keyed by file path + mtime + size, so each track is decoded at most once.

/**
 * Number of peak buckets computed per track. Fixed (not derived from the
 * rendered width) so the on-disk cache is resolution-stable — the renderer
 * downsamples these to however many bars it actually draws.
 */
export const WAVEFORM_PEAK_COUNT = 512;

/**
 * Result of a waveform-peaks request. The handler resolves `null` instead of
 * this shape when the file is missing or its format can't be decoded natively;
 * the renderer treats `null` as "no waveform" and falls back to a flat bar.
 */
export interface WaveformPeaksResult {
  /** `WAVEFORM_PEAK_COUNT` absolute amplitudes in 0..1 (un-normalised). */
  peaks: number[];
}
