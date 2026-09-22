// Wire types for the one-pass analysis IPC surface (the v2 analysis engine).
//
// One decode per track feeds every analyser at once — waveform peaks,
// loudness, and tempo/key — and the measurements persist on the track row.
// The backend re-checks stored state per track and skips settled ones, so the
// renderer may submit generously.

/** Input track for an analysis run. */
export interface AnalysisInput {
  id: string;
  filePath: string;
  title: string;
}

/**
 * Per-track progress event streamed during an analysis run. `current` is a
 * settled-count, not an index — the run is parallel and has no meaningful
 * "current track".
 */
export interface AnalysisProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'done' | 'skipped' | 'error' | 'cancelled';
}

/** Result of an analysis batch run. */
export interface AnalysisBatchResult {
  /** Tracks decoded and measured this run. */
  analyzed: number;
  /** Tracks needing nothing, or no longer on disk. */
  skipped: number;
  /** Tracks that failed to decode. */
  failed: number;
}
