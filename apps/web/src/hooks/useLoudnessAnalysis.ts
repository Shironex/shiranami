import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { LoudnessAnalyzeInput, LoudnessProgress } from '@shiranami/contracts';
import { useLibraryStore } from '@/stores/useLibraryStore';
import type { Track } from '@/stores/types';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import { IS_ELECTRON } from '@/lib/platform';
import { isRadioTrack } from '@/lib/utils';
import { logger } from '@/lib/logger';
import i18n from '@/lib/i18n';

interface LoudnessAnalysisState {
  running: boolean;
  current: number;
  total: number;
  trackName: string;
}

const IDLE: LoudnessAnalysisState = { running: false, current: 0, total: 0, trackName: '' };

/**
 * The tracks a run must submit, album-aware (F5). A track owes a decode when
 * its own profile is incomplete (`loudnessLufs` or `truePeakDb` missing —
 * v1-analysed rows owe their true peak once). Albums are all-or-nothing: one
 * pending member submits the *whole* record, because the album fold needs
 * every member's analyser state in the same run. Untagged tracks — including
 * the unknown-album pile, un-collapsed from the mapper's display string —
 * submit alone and never fold. Exported for tests.
 */
export function pendingLoudnessInput(library: Track[]): LoudnessAnalyzeInput[] {
  const unknownAlbum = i18n.t('unknownAlbum', { ns: 'common' });
  const needsProfile = (track: Track) => track.loudnessLufs == null || track.truePeakDb == null;
  const albumKeyOf = (track: Track): string | null => {
    const album = (track.album ?? '').trim();
    if (!album || album === unknownAlbum) return null;
    return `${(track.albumArtist ?? track.artist).trim()}\u001f${album}`;
  };

  const albums = new Map<string, Track[]>();
  const singles: Track[] = [];
  for (const track of library) {
    if (isRadioTrack(track.filePath)) continue;
    const key = albumKeyOf(track);
    if (key === null) {
      singles.push(track);
    } else {
      const members = albums.get(key);
      if (members) members.push(track);
      else albums.set(key, [track]);
    }
  }

  const submit: Array<{ track: Track; album: string | null }> = [];
  for (const members of albums.values()) {
    const pending = members.some(
      member => needsProfile(member) || member.albumLoudnessLufs == null
    );
    if (!pending) continue;
    for (const member of members) submit.push({ track: member, album: member.album });
  }
  for (const single of singles) {
    if (needsProfile(single)) submit.push({ track: single, album: null });
  }

  return submit.map(({ track, album }) => ({
    id: track.id,
    filePath: track.filePath,
    title: track.title,
    album,
    albumArtist: track.albumArtist ?? track.artist,
  }));
}

/**
 * Drives a library-wide loudness-analysis run via the main process. Streams
 * progress and exposes start/cancel. Submits the album-aware pending set from
 * `pendingLoudnessInput` (the main process re-checks and skips settled groups).
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

    const pending = pendingLoudnessInput(useLibraryStore.getState().library);

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
      logger.error('Loudness analysis failed', err);
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
