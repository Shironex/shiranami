import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, AlertCircle, Music, Check } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { queryClient } from '@/lib/queryClient';
import { playlistKeys } from '@/hooks/queries/usePlaylists';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TrackPayload {
  title: string;
  artist: string;
  ytId: string;
}

interface ImportData {
  type: 'TRACK' | 'PLAYLIST';
  payload: { title?: string; artist?: string; ytId?: string; name?: string; tracks?: TrackPayload[] };
  code: string;
  expiresAt: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
}

export function ImportDialog({ open, onOpenChange, code }: ImportDialogProps) {
  const { t } = useTranslation('share');
  const { importTrack } = useTrackImport();
  const [state, setState] = useState<'loading' | 'ready' | 'downloading' | 'done' | 'error'>('loading');
  const [data, setData] = useState<ImportData | null>(null);
  const [error, setError] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);

  useEffect(() => {
    if (!open || !IS_ELECTRON || !code) return;

    let cancelled = false;
    setState('loading');
    setError('');

    window.electronAPI.share.import(code)
      .then((result) => {
        if (cancelled) return;
        const importData = result as ImportData;
        setData(importData);
        setPlaylistName(importData.type === 'PLAYLIST' ? (importData.payload.name ?? '') : '');
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message ?? 'Failed to load shared content');
        setState('error');
      });

    return () => { cancelled = true; };
  }, [open, code]);

  const handleDownloadAll = useCallback(async () => {
    if (!data || !IS_ELECTRON) return;

    const trackList = data.type === 'PLAYLIST'
      ? data.payload.tracks ?? []
      : [{ title: data.payload.title!, artist: data.payload.artist!, ytId: data.payload.ytId! }];

    setState('downloading');
    setDownloadTotal(trackList.length);
    setDownloadProgress(0);

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
          const allTracks = await window.electronAPI.db.tracks.getAll() as Array<{ id: string; filePath: string }>;
          const existing = allTracks.find(t => t.filePath === filePath);
          if (existing) importedTrackIds.push(existing.id);
        }
      } catch {
        // Continue with remaining tracks
      }
      setDownloadProgress(i + 1);
    }

    // Create playlist if it's a playlist import and we have tracks
    if (data.type === 'PLAYLIST' && importedTrackIds.length > 0) {
      try {
        const name = playlistName.trim() || data.payload.name || 'Imported Playlist';
        const playlist = await window.electronAPI.db.playlists.create({ name }) as { id: string };
        for (const trackId of importedTrackIds) {
          await window.electronAPI.db.playlists.addTrack(playlist.id, trackId);
        }
        queryClient.invalidateQueries({ queryKey: playlistKeys.all });
      } catch {
        // Playlist creation failed but downloads succeeded
      }
    }

    setState('done');
  }, [data, playlistName, importTrack]);

  const tracks = data?.type === 'PLAYLIST'
    ? data.payload.tracks ?? []
    : data ? [{ title: data.payload.title!, artist: data.payload.artist!, ytId: data.payload.ytId! }] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('importTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto overflow-x-hidden scrollbar-thin max-h-[calc(80vh-5rem)]">
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t('loadingShare')}</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">{error}</p>
          </div>
        )}

        {(state === 'ready' || state === 'downloading' || state === 'done') && data && (
          <div className="space-y-4 mt-2">
            {/* Playlist name */}
            {data.type === 'PLAYLIST' && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">{t('playlistName')}</label>
                <input
                  type="text"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  disabled={state !== 'ready'}
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors disabled:opacity-50"
                  placeholder={data.payload.name ?? ''}
                />
                <p className="text-xs text-muted-foreground">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</p>
              </div>
            )}

            {/* Track list */}
            <div className="space-y-1 max-h-[280px] overflow-y-auto scrollbar-thin">
              {tracks.map((track, i) => {
                const isCompleted = (state === 'downloading' && i < downloadProgress) || state === 'done';
                const isActive = state === 'downloading' && i === downloadProgress;
                const isPending = state === 'downloading' && i > downloadProgress;

                return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors duration-300 ${
                    isActive ? 'bg-primary/10 border border-primary/20' :
                    isCompleted ? 'bg-green-500/5' :
                    'bg-accent/30'
                  }`}
                >
                  <span className={`text-xs w-5 text-center shrink-0 transition-colors duration-300 ${
                    isCompleted ? 'text-green-400' :
                    isActive ? 'text-primary' :
                    'text-muted-foreground/50'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 mx-auto" />
                    ) : isActive ? (
                      <Loader2 className="w-3.5 h-3.5 mx-auto animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <Music className={`w-4 h-4 shrink-0 transition-colors duration-300 ${
                    isCompleted ? 'text-green-400/50' :
                    isActive ? 'text-primary/60' :
                    'text-muted-foreground/40'
                  }`} />
                  <div className="min-w-0 overflow-hidden flex-1">
                    <p className={`text-sm truncate transition-colors duration-300 ${
                      isPending ? 'text-muted-foreground/60' : 'text-foreground'
                    }`}>{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  </div>
                </div>
                );
              })}
            </div>

            {/* Progress bar */}
            {state === 'downloading' && (
              <div className="space-y-2">
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(downloadProgress / downloadTotal) * 100}%` }}
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {t('downloadingProgress', { current: downloadProgress, total: downloadTotal })}
                </p>
              </div>
            )}

            {/* Actions */}
            {state === 'ready' && (
              <button
                onClick={handleDownloadAll}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                <Download className="w-4 h-4 inline-block mr-2 -mt-0.5" />
                {t('downloadAll', { count: tracks.length })}
              </button>
            )}

            {state === 'done' && (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-sm text-green-400 font-medium">{t('downloadComplete')}</p>
                {data.type === 'PLAYLIST' && (
                  <p className="text-xs text-muted-foreground">{t('playlistCreated', { name: playlistName.trim() || data.payload.name })}</p>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
