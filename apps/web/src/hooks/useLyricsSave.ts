import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  LyricsBatchProgress,
  LyricsBatchSummary,
  LyricsBatchTrack,
} from '@shiranami/contracts';
import { useLibraryStore } from '@/stores/useLibraryStore';
import type { Track } from '@/stores/types';
import { IS_ELECTRON } from '@/lib/platform';
import { isRadioTrack } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface LyricsSaveState {
  running: boolean;
  current: number;
  total: number;
  trackName: string;
}

const IDLE: LyricsSaveState = { running: false, current: 0, total: 0, trackName: '' };

/**
 * The tracks a write-back run submits: every real file in the library. Radio
 * pseudo-tracks never submit — there is no file to write a `.lrc` beside, and
 * the backend would only skip them at the cost of a progress tick each.
 *
 * Nothing else is filtered here. Whether a track already has a lyric file, and
 * whether its folder may be written to, are the backend's questions: it answers
 * both from disk before it spends an LRCLIB request, and a renderer-side guess
 * would only be a second answer to keep in agreement. Exported for tests.
 */
export function pendingLyricsSaveInput(library: Track[]): LyricsBatchTrack[] {
  return library
    .filter(track => !isRadioTrack(track.filePath))
    .map(track => ({
      id: track.id,
      filePath: track.filePath,
      title: track.title,
      artist: track.artist,
      // Both are always present on a display track. The placeholder album is
      // dropped backend-side, where the LRCLIB query is built — narrowing the
      // search to records literally titled "Unknown Album" is worse than
      // sending none.
      album: track.album,
      durationSeconds: track.duration,
    }));
}

/**
 * Drives a library-wide lyrics write-back run. Streams progress and exposes
 * start/cancel, and hands the finished summary back so the caller can report
 * what the run managed.
 *
 * The library store is deliberately not refreshed afterwards: write-back adds
 * files beside tracks and changes no database row, and the lyrics panel re-reads
 * disk on every track change already.
 */
export function useLyricsSave() {
  const [state, setState] = useState<LyricsSaveState>(IDLE);
  const [summary, setSummary] = useState<LyricsBatchSummary | null>(null);
  const runningRef = useRef(false);
  const { t: tToast } = useTranslation('toast');

  useEffect(() => {
    if (!IS_ELECTRON || window.electronAPI.lyrics?.onSaveProgress == null) return;
    return window.electronAPI.lyrics.onSaveProgress((data: LyricsBatchProgress) => {
      setState(prev => ({
        ...prev,
        // The tick is a settled count and delivery order between two racing
        // ticks is not guaranteed, so the bar takes the max and never goes
        // backwards.
        current: Math.max(prev.current, data.current),
        total: data.total,
        trackName: data.trackName,
      }));
    });
  }, []);

  const start = useCallback(async () => {
    const api = IS_ELECTRON ? window.electronAPI.lyrics : undefined;
    if (api?.saveBatch == null || runningRef.current) return;

    const pending = pendingLyricsSaveInput(useLibraryStore.getState().library);
    if (pending.length === 0) return;

    runningRef.current = true;
    setSummary(null);
    setState({ running: true, current: 0, total: pending.length, trackName: '' });
    try {
      setSummary(await api.saveBatch(pending));
    } catch (err) {
      logger.error('Lyrics write-back failed', err);
      toast.error(tToast('lyricsSaveFailed'), { id: 'lyrics-save-error' });
    } finally {
      runningRef.current = false;
      setState(IDLE);
    }
  }, [tToast]);

  const cancel = useCallback(() => {
    if (!IS_ELECTRON || window.electronAPI.lyrics?.saveCancel == null) return;
    void window.electronAPI.lyrics.saveCancel();
  }, []);

  return { ...state, summary, start, cancel };
}
