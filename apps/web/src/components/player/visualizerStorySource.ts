import type { FrequencySource } from './visualizer-source';

/**
 * A deterministic, audio-free frequency source so a story can drive the real
 * per-frame draw path without the playback engine — two summed sine waves
 * tapered toward the high bins, mirroring the rough shape of real spectrum
 * data (same shape the settings preview uses). Shared across every visualizer
 * story so the synthetic spectrum stays identical and lives in one place.
 */
export function createSyntheticSource(): FrequencySource {
  let t = 0;
  return {
    binCount: 256,
    read(buf) {
      t += 0.04;
      for (let i = 0; i < buf.length; i++) {
        const x = i / buf.length;
        const a = Math.sin(t + x * 7) * (1 - x);
        const b = Math.sin(t * 1.6 + x * 3.5 + 1.1) * (1 - x * 0.55);
        buf[i] = Math.max(0, Math.min(255, ((a + b) * 0.5 + 0.5) * 255 * 0.65));
      }
      return true;
    },
  };
}
