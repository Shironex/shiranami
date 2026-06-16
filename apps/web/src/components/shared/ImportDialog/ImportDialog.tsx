import { Download, Loader2, AlertCircle, Music, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useImportDialog } from './ImportDialog.hooks';
import type { IImportDialogProps } from './ImportDialog.types';

export default function ImportDialog(props: IImportDialogProps) {
  const { open, onOpenChange } = props;
  const {
    t,
    state,
    data,
    progress,
    total,
    playlistName,
    setPlaylistName,
    error,
    tracks,
    progressWidth,
    startImport,
  } = useImportDialog(props);

  const trackCountLabel = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;

  const isLoadingOrIdle = state === 'loading' || state === 'idle';
  const isResultState = state === 'ready' || state === 'downloading' || state === 'done';
  // Narrow `data` to non-null only when a result state is active, so the result
  // block can be guarded by a single (non-chained) `{resultData && ...}`.
  const resultData = isResultState ? data : null;
  // Narrowed playlist payload for the done-state confirmation row. Non-null here
  // already implies it is a playlist, so the JSX guard stays a single `&&`.
  const playlistData = resultData?.type === 'PLAYLIST' ? resultData : null;

  const trackRows = tracks.map((track, i) => {
    const isCompleted = (state === 'downloading' && i < progress) || state === 'done';
    const isActive = state === 'downloading' && i === progress;
    const isPending = state === 'downloading' && i > progress;

    return (
      <div
        key={i}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors duration-300 ${
          isActive
            ? 'bg-primary/10 border border-primary/20'
            : isCompleted
              ? 'bg-green-500/5'
              : 'bg-accent/30'
        }`}
      >
        <span
          className={`text-xs w-5 text-center shrink-0 transition-colors duration-300 ${
            isCompleted ? 'text-green-400' : isActive ? 'text-primary' : 'text-muted-foreground/50'
          }`}
        >
          {isCompleted ? (
            <Check className="w-3.5 h-3.5 mx-auto" />
          ) : isActive ? (
            <Loader2 className="w-3.5 h-3.5 mx-auto animate-spin" />
          ) : (
            i + 1
          )}
        </span>
        <Music
          className={`w-4 h-4 shrink-0 transition-colors duration-300 ${
            isCompleted
              ? 'text-green-400/50'
              : isActive
                ? 'text-primary/60'
                : 'text-muted-foreground/40'
          }`}
        />
        <div className="min-w-0 overflow-hidden flex-1">
          <p
            className={`text-sm truncate transition-colors duration-300 ${
              isPending ? 'text-muted-foreground/60' : 'text-foreground'
            }`}
          >
            {track.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
        </div>
      </div>
    );
  });

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
          {isLoadingOrIdle && (
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

          {resultData && (
            <div className="space-y-4 mt-2">
              {/* Playlist name */}
              {resultData.type === 'PLAYLIST' && (
                <div className="space-y-1.5">
                  <label htmlFor="playlist-name" className="text-xs text-muted-foreground">
                    {t('playlistName')}
                  </label>
                  <Input
                    id="playlist-name"
                    type="text"
                    value={playlistName}
                    onChange={e => setPlaylistName(e.target.value)}
                    disabled={state !== 'ready'}
                    className="h-auto w-full px-3 py-2 rounded-xl bg-muted border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary/40 focus-visible:border-primary/40 shadow-none"
                    placeholder={resultData.payload.name ?? ''}
                  />
                  <p className="text-xs text-muted-foreground">{trackCountLabel}</p>
                </div>
              )}

              {/* Track list */}
              <div className="space-y-1 max-h-[280px] overflow-y-auto scrollbar-thin">
                {trackRows}
              </div>

              {/* Progress bar */}
              {state === 'downloading' && (
                <div className="space-y-2">
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                      style={{ width: progressWidth }}
                    />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    {t('downloadingProgress', { current: progress, total })}
                  </p>
                </div>
              )}

              {/* Actions */}
              {state === 'ready' && (
                <Button onClick={startImport} className="h-auto w-full rounded-xl py-2.5">
                  <Download />
                  {t('downloadAll', { count: tracks.length })}
                </Button>
              )}

              {state === 'done' && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-400" />
                  </div>
                  <p className="text-sm text-green-400 font-medium">{t('downloadComplete')}</p>
                  {playlistData && (
                    <p className="text-xs text-muted-foreground">
                      {t('playlistCreated', {
                        name: playlistName.trim() || playlistData.payload.name,
                      })}
                    </p>
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
