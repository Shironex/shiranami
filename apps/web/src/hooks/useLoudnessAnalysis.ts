import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { LoudnessProgress } from '@shiranami/contracts';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import { IS_ELECTRON } from '@/lib/platform';
import { isRadioTrack } from '@/lib/utils';

interface LoudnessAnalysisState {
  running: boolean;
  current: number;
  total: number;
  trackName: string;
}

const IDLE: LoudnessAnalysisState = { running: false, current: 0, total: 0, trackName: '' };

/**
 * Drives a library-wide loudness-analysis run via the main process. Streams
 * progress and exposes start/cancel. Only un-analysed, non-radio library tracks
 * are submitted (the main process additionally skips anything already measured).
 */
export function useLoudnessAnalysis() {
  const [state, setState] = useState<LoudnessAnalysisState>(IDLE);
  const runningRef = useRef(false);
  const { t: tToast } = useTranslation('toast');

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const unsub = window.electronAPI.loudness.onProgress((data: LoudnessProgress) => {
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
      .filter(t => !isRadioTrack(t.filePath) && t.loudnessLufs == null)
      .map(t => ({ id: t.id, filePath: t.filePath, title: t.title }));

    if (pending.length === 0) return;

    runningRef.current = true;
    setState({ running: true, current: 0, total: pending.length, trackName: '' });
    try {
      await window.electronAPI.loudness.analyze(pending);
      // Pull the freshly-measured loudness values back into the renderer so the
      // engine's per-track gain reflects them without an app restart.
      const allDbTracks = await window.electronAPI.db.tracks.getAll();
      const refreshed = mapDbTracksToTracks(allDbTracks as DbTrackRecord[]);
      useLibraryStore.getState().setLibrary(refreshed);
    } catch (err) {
      console.error('Loudness analysis failed', err);
      toast.error(tToast('loudnessAnalysisFailed'), { id: 'loudness-analysis-error' });
    } finally {
      runningRef.current = false;
      setState(IDLE);
    }
  }, [tToast]);

  const cancel = useCallback(() => {
    if (!IS_ELECTRON) return;
    void window.electronAPI.loudness.cancel();
  }, []);

  return { ...state, start, cancel };
}
