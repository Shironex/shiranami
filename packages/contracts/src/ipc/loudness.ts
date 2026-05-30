// Wire types for the loudness-analysis IPC surface (EBU R128 / ReplayGain).
//
// Loudness is measured once per track with ffmpeg `loudnorm` and the integrated
// loudness (LUFS) is persisted on the track row. The renderer derives the
// playback gain from the measured LUFS and the user's target LUFS at apply
// time, so changing the target re-levels instantly without re-analysis.

/** Input track for a loudness-analysis run. */
export interface LoudnessAnalyzeInput {
  id: string;
  filePath: string;
  title: string;
}

/** Per-track progress event streamed during a loudness-analysis run. */
export interface LoudnessProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'analyzing' | 'done' | 'skipped' | 'error' | 'cancelled';
}

/** Result of a loudness-analysis batch run. */
export interface LoudnessAnalyzeResult {
  /** Tracks whose `loudnessLufs` was newly measured and persisted. */
  analyzed: number;
  /** Tracks skipped (already analysed, non-finite loudness, or missing file). */
  skipped: number;
  /** Tracks that errored during analysis. */
  failed: number;
}
