import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AnalysisInput, AnalysisProgress } from '@shiranami/contracts';
import { useLibraryStore } from '@/stores/useLibraryStore';
import type { Track } from '@/stores/types';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import { IS_ELECTRON } from '@/lib/platform';
import { isRadioTrack } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface AnalysisState {
  running: boolean;
  current: number;
  total: number;
  trackName: string;
}

const IDLE: AnalysisState = { running: false, current: 0, total: 0, trackName: '' };

/**
 * The tracks a one-pass analysis run must submit: every real file still
 * missing a tempo or key estimate. Radio pseudo-tracks never submit (no file
 * to decode). A caveat the engine owns: `NULL` also means "analysed, nothing
 * detectable", so beatless tracks resubmit — the backend's per-track skip
 * test decides cheaply what actually decodes. Exported for tests.
 */
export function pendingAnalysisInput(library: Track[]): AnalysisInput[] {
  return library
    .filter(track => !isRadioTrack(track.filePath))
    .filter(track => track.bpm == null || track.musicalKey == null)
    .map(track => ({ id: track.id, filePath: track.filePath, title: track.title }));
}

/**
 * Drives a library-wide one-pass analysis run (waveform + loudness +
 * tempo/key) via the backend. Streams progress and exposes start/cancel.
 * After a run, the library is re-pulled so the fresh BPM/key reach the store —
 * which is what lets tempo breathing engage without an app restart.
 */
export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>(IDLE);
  const runningRef = useRef(false);
  const { t: tToast } = useTranslation('toast');

  useEffect(() => {
    if (!IS_ELECTRON || window.electronAPI.analysis == null) return;
    const unsub = window.electronAPI.analysis.onProgress((data: AnalysisProgress) => {
      setState(prev => ({
        ...prev,
        current: data.current,
        total: data.total,
        trackName: data.trackName,
      }));
    });
    return unsub;
  }, []);

  const start = useCallback(async () => {
    const api = IS_ELECTRON ? window.electronAPI.analysis : undefined;
    if (api == null || runningRef.current) return;

    const pending = pendingAnalysisInput(useLibraryStore.getState().library);

    if (pending.length === 0) return;

    runningRef.current = true;
    setState({ running: true, current: 0, total: pending.length, trackName: '' });
    try {
      await api.analyze(pending);
      // Pull the fresh measurements back into the renderer: the tempo/key show
      // up in Now Playing and the breathing engages without a restart.
      const allDbTracks = await window.electronAPI.db.tracks.getAll();
      const refreshed = mapDbTracksToTracks(allDbTracks as DbTrackRecord[]);
      useLibraryStore.getState().setLibrary(refreshed);
    } catch (err) {
      logger.error('Library analysis failed', err);
      toast.error(tToast('analysisFailed'), { id: 'analysis-error' });
    } finally {
      runningRef.current = false;
      setState(IDLE);
    }
  }, [tToast]);

  const cancel = useCallback(() => {
    if (!IS_ELECTRON || window.electronAPI.analysis == null) return;
    void window.electronAPI.analysis.cancel();
  }, []);

  return { ...state, start, cancel };
}
