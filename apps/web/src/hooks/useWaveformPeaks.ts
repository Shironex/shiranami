import { useEffect, useState } from 'react';
import { isRadioTrack } from '@/lib/utils';

/**
 * Fetch waveform peaks for a track's file path. The main process decodes the
 * file natively (.wav/.flac/.mp3) and caches the result on disk, so repeat
 * plays resolve instantly.
 *
 * Returns null while loading, for radio streams, or when the file's format
 * can't be decoded natively — callers render a flat seekbar in that case.
 */
export function useWaveformPeaks(filePath: string | null | undefined): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    setPeaks(null);
    if (!filePath || isRadioTrack(filePath)) return;
    // No preload bridge in a plain browser (web build) — fall back to a flat bar.
    if (!window.electronAPI?.waveform) return;

    let cancelled = false;
    window.electronAPI.waveform
      .getPeaks(filePath)
      .then(result => {
        if (!cancelled) setPeaks(result ? Float32Array.from(result.peaks) : null);
      })
      .catch(() => {
        if (!cancelled) setPeaks(null);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return peaks;
}
