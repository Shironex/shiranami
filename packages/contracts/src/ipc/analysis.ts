// Wire types for the musical-analysis IPC surface (tempo + key).
//
// Tempo (BPM) and musical key are estimated once per track by the native
// analysis addon (libebur128-free DSP: energy-autocorrelation tempo + an FFT
// chromagram key) and persisted on the track row. Mirrors the loudness IPC
// surface — one batch at a time, per-track progress, abortable.

/** Input track for a musical-analysis run. */
export interface AnalysisAnalyzeInput {
  id: string;
  filePath: string;
  title: string;
}

/** Per-track progress event streamed during a musical-analysis run. */
export interface AnalysisProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'analyzing' | 'done' | 'skipped' | 'error' | 'cancelled';
}

/** Result of a musical-analysis batch run. */
export interface AnalysisAnalyzeResult {
  /** Tracks whose `bpm`/`musicalKey` were newly estimated and persisted. */
  analyzed: number;
  /** Tracks skipped (already analysed, nothing detectable, or missing file). */
  skipped: number;
  /** Tracks that errored during analysis. */
  failed: number;
}
