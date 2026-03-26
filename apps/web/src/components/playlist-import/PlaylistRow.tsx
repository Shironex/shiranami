import {
  Loader2,
  Check,
  AlertCircle,
  Music,
  X,
  Download,
  Play,
  Pause,
} from 'lucide-react';
import { type RowComponentProps } from 'react-window';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import {
  type PlaylistTrack,
  type PlaylistTrackStatus,
} from '@/stores/usePlaylistImportStore';

export interface PlaylistRowProps {
  tracks: PlaylistTrack[];
  isImporting: boolean;
  previewLoadingId: string | null;
  isPreviewPlaying: (result: { id: string }) => boolean;
  handlePreview: (result: PlaylistTrack['searchResult']) => void;
  handleRemoveTrack: (id: string) => void;
}

function StatusIcon({ track }: { track: PlaylistTrack }) {
  switch (track.status) {
    case 'done':
      return <Check className="w-4 h-4 text-green-400" />;
    case 'downloading':
    case 'converting':
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-destructive" />;
    case 'skipped':
      return <Check className="w-3.5 h-3.5 text-muted-foreground/50" />;
    default:
      return <Download className="w-4 h-4 text-muted-foreground/30" />;
  }
}

function useStatusLabel() {
  const { t } = useTranslation('import');
  return (status: PlaylistTrackStatus): string => {
    switch (status) {
      case 'downloading':
        return t('statusDownloading');
      case 'converting':
        return t('statusConverting');
      case 'done':
        return t('statusDone');
      case 'error':
        return t('statusFailed');
      case 'skipped':
        return t('statusAlreadyInLibrary');
      default:
        return t('statusWaiting');
    }
  };
}

export function PlaylistRow(props: RowComponentProps<PlaylistRowProps>) {
  const { t } = useTranslation('import');
  const { t: tSearch } = useTranslation('search');
  const statusLabel = useStatusLabel();
  const {
    index,
    style,
    tracks,
    isImporting,
    previewLoadingId,
    isPreviewPlaying,
    handlePreview,
    handleRemoveTrack,
  } = props as RowComponentProps<PlaylistRowProps> & PlaylistRowProps;

  const playlistTrack = tracks[index];
  if (!playlistTrack) return null;

  const result = playlistTrack.searchResult;
  const isActive =
    playlistTrack.status === 'downloading' || playlistTrack.status === 'converting';

  return (
    <div style={style} className="px-0.5">
      <div className="group flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors relative overflow-hidden h-full">
        {isActive && (
          <div
            className="absolute inset-0 bg-primary/5 transition-all duration-300"
            style={{ width: `${playlistTrack.progress}%` }}
          />
        )}

        <span className="w-6 text-center text-xs text-muted-foreground/40 tabular-nums relative z-10">
          {index + 1}
        </span>

        <button
          onClick={() => handlePreview(result)}
          className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0 relative z-10 group/thumb"
          title={isPreviewPlaying(result) ? tSearch('pausePreview') : tSearch('preview')}
        >
          {result.thumbnail ? (
            <img src={result.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4 text-muted-foreground/40" />
            </div>
          )}
          <div
            className={cn(
              'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity',
              isPreviewPlaying(result) ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'
            )}
          >
            {previewLoadingId === result.id ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : isPreviewPlaying(result) ? (
              <Pause className="w-4 h-4 text-white" />
            ) : (
              <Play className="w-4 h-4 text-white" />
            )}
          </div>
        </button>

        <div className="flex-1 min-w-0 relative z-10">
          <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground truncate">{result.uploader}</p>
            {playlistTrack.status !== 'pending' && (
              <span
                className={cn(
                  'text-[10px] font-medium shrink-0',
                  playlistTrack.status === 'done' && 'text-green-400',
                  playlistTrack.status === 'error' && 'text-destructive',
                  playlistTrack.status === 'skipped' && 'text-muted-foreground/50',
                  (playlistTrack.status === 'downloading' || playlistTrack.status === 'converting') &&
                    'text-primary'
                )}
              >
                {statusLabel(playlistTrack.status)}
                {playlistTrack.status === 'error' && playlistTrack.error ? `: ${playlistTrack.error}` : ''}
              </span>
            )}
          </div>
        </div>

        <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
          {formatDuration(result.duration)}
        </span>

        <div className="shrink-0 relative z-10 w-9 h-9 flex items-center justify-center">
          <StatusIcon track={playlistTrack} />
        </div>

        {playlistTrack.status === 'pending' && !isImporting && (
          <button
            onClick={() => handleRemoveTrack(playlistTrack.id)}
            className="shrink-0 relative z-10 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
            title={t('removeFromList')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
