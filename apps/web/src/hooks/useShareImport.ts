import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

export type ShareImportState = 'idle' | 'loading' | 'ready' | 'downloading' | 'done' | 'error';

interface TrackPayload {
  title: string;
  artist: string;
  ytId: string;
}

export interface ImportData {
  type: 'TRACK' | 'PLAYLIST';
  payload: {
    title?: string;
    artist?: string;
    ytId?: string;
    name?: string;
    tracks?: TrackPayload[];
  };
  code: string;
  expiresAt: string;
}

export interface UseShareImportResult {
  state: ShareImportState;
  data: ImportData | null;
  progress: number;
  total: number;
  playlistName: string;
  setPlaylistName: (name: string) => void;
  error: string;
  loadShare: (code: string) => () => void;
  startImport: () => Promise<void>;
  reset: () => void;
}

/**
 * Encapsulates the import-share state machine used by ImportDialog.
 * `loadShare` returns a cancel function so callers can abort if unmounted.
 */
export function useShareImport(): UseShareImportResult {
  const queryClient = useQueryClient();
  const { importTrack } = useTrackImport();

  const [state, setState] = useState<ShareImportState>('idle');
  const [data, setData] = useState<ImportData | null>(null);
  const [error, setError] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  const loadShare = useCallback((code: string) => {
    if (!IS_ELECTRON || !code) return () => {};

    let cancelled = false;
    setState('loading');
    setError('');

    window.electronAPI.share
      .import(code)
      .then((result) => {
        if (cancelled) return;
        const importData = result as ImportData;
        setData(importData);
        setPlaylistName(
          importData.type === 'PLAYLIST' ? importData.payload.name ?? '' : '',
        );
        setState('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message ?? 'Failed to load shared content');
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const startImport = useCallback(async () => {
    if (!data || !IS_ELECTRON) return;

    const trackList =
      data.type === 'PLAYLIST'
        ? data.payload.tracks ?? []
        : [
            {
              title: data.payload.title!,
              artist: data.payload.artist!,
              ytId: data.payload.ytId!,
            },
          ];

    setState('downloading');
    setTotal(trackList.length);
    setProgress(0);

    const importedTrackIds: string[] = [];

    for (let i = 0; i < trackList.length; i++) {
      try {
        const url = `https://www.youtube.com/watch?v=${trackList[i].ytId}`;
        const filePath = await window.electronAPI.downloader.download(url);
        const track = await importTrack(filePath);
        if (track) {
          importedTrackIds.push(track.id);
        } else {
          // Track already exists — find it by searching the library
          const allTracks = (await window.electronAPI.db.tracks.getAll()) as Array<{
            id: string;
            filePath: string;
          }>;
          const existing = allTracks.find((t) => t.filePath === filePath);
          if (existing) importedTrackIds.push(existing.id);
        }
      } catch {
        // Continue with remaining tracks
      }
      setProgress(i + 1);
    }

    // Create playlist if it's a playlist import and we have tracks
    if (data.type === 'PLAYLIST' && importedTrackIds.length > 0) {
      try {
        const name =
          playlistName.trim() || data.payload.name || 'Imported Playlist';
        const playlist = (await window.electronAPI.db.playlists.create({
          name,
        })) as { id: string };
        for (const trackId of importedTrackIds) {
          await window.electronAPI.db.playlists.addTrack(playlist.id, trackId);
        }
        queryClient.invalidateQueries({ queryKey: playlistKeys.all });
      } catch {
        // Playlist creation failed but downloads succeeded
      }
    }

    setState('done');
  }, [data, playlistName, importTrack, queryClient]);

  const reset = useCallback(() => {
    setState('idle');
    setData(null);
    setError('');
    setPlaylistName('');
    setProgress(0);
    setTotal(0);
  }, []);

  return {
    state,
    data,
    progress,
    total,
    playlistName,
    setPlaylistName,
    error,
    loadShare,
    startImport,
    reset,
  };
}
