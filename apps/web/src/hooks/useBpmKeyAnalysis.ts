import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AnalysisProgress } from '@shiranami/contracts';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import { IS_ELECTRON } from '@/lib/platform';
import { isRadioTrack } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface BpmKeyAnalysisState {
  running: boolean;
  current: number;
  total: number;
  trackName: string;
}

const IDLE: BpmKeyAnalysisState = { running: false, current: 0, total: 0, trackName: '' };

/**
 * Drives a library-wide tempo + key analysis run via the main process. Streams
 * progress and exposes start/cancel. Only un-analysed, non-radio library tracks
 * are submitted (the main process additionally skips anything already measured).
 * Mirrors useLoudnessAnalysis — the established per-feature analysis convention.
 */
export function useBpmKeyAnalysis() {
  const [state, setState] = useState<BpmKeyAnalysisState>(IDLE);
  const runningRef = useRef(false);
  const { t: tToast } = useTranslation('toast');

  useEffect(() => {
    if (!IS_ELECTRON) return;
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
    if (!IS_ELECTRON || runningRef.current) return;

    const library = useLibraryStore.getState().library;
    const pending = library
      .filter(t => !isRadioTrack(t.filePath) && t.bpm == null && t.musicalKey == null)
      .map(t => ({ id: t.id, filePath: t.filePath, title: t.title }));

    if (pending.length === 0) return;

    runningRef.current = true;
    setState({ running: true, current: 0, total: pending.length, trackName: '' });
    try {
      await window.electronAPI.analysis.analyze(pending);
      // Pull the freshly-estimated tempo/key values back into the renderer so
      // the now-playing display reflects them without an app restart.
      const allDbTracks = await window.electronAPI.db.tracks.getAll();
      const refreshed = mapDbTracksToTracks(allDbTracks as DbTrackRecord[]);
      useLibraryStore.getState().setLibrary(refreshed);
    } catch (err) {
      logger.error('Tempo/key analysis failed', err);
      toast.error(tToast('analysisFailed'), { id: 'bpm-key-analysis-error' });
    } finally {
      runningRef.current = false;
      setState(IDLE);
    }
  }, [tToast]);

  const cancel = useCallback(() => {
    if (!IS_ELECTRON) return;
    void window.electronAPI.analysis.cancel();
  }, []);

  return { ...state, start, cancel };
}
