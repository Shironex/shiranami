import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, AlertCircle, Music, Check } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
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
  const [state, setState] = useState<'loading' | 'ready' | 'downloading' | 'done' | 'error'>('loading');
  const [data, setData] = useState<ImportData | null>(null);
  const [error, setError] = useState('');
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
        setData(result as ImportData);
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

    const tracks = data.type === 'PLAYLIST'
      ? data.payload.tracks ?? []
      : [{ title: data.payload.title!, artist: data.payload.artist!, ytId: data.payload.ytId! }];

    setState('downloading');
    setDownloadTotal(tracks.length);
    setDownloadProgress(0);

    for (let i = 0; i < tracks.length; i++) {
      try {
        const url = `https://www.youtube.com/watch?v=${tracks[i].ytId}`;
        await window.electronAPI.downloader.download(url);
      } catch {
        // Continue with remaining tracks
      }
      setDownloadProgress(i + 1);
    }

    setState('done');
  }, [data]);

  const tracks = data?.type === 'PLAYLIST'
    ? data.payload.tracks ?? []
    : data ? [{ title: data.payload.title!, artist: data.payload.artist!, ytId: data.payload.ytId! }] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('importTitle')}
          </DialogTitle>
        </DialogHeader>

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
            {/* Title */}
            {data.type === 'PLAYLIST' && (
              <div>
                <p className="text-sm font-medium text-foreground">{data.payload.name}</p>
                <p className="text-xs text-muted-foreground">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</p>
              </div>
            )}

            {/* Track list */}
            <div className="space-y-1 max-h-[280px] overflow-y-auto scrollbar-thin">
              {tracks.map((track, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-accent/30">
                  <span className="text-xs text-muted-foreground/50 w-5 text-center shrink-0">{i + 1}</span>
                  <Music className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  </div>
                  {state === 'downloading' && i < downloadProgress && (
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                  )}
                  {state === 'done' && (
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Progress */}
            {state === 'downloading' && (
              <div className="space-y-2">
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
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
                {t('downloadAll', { count: tracks.length })}
              </button>
            )}

            {state === 'done' && (
              <p className="text-center text-sm text-green-400 font-medium">{t('downloadComplete')}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
