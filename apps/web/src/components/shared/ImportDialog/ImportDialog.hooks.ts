import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShareImport } from '@/hooks/useShareImport';
import type { IImportDialogProps, IImportDialogView, IImportTrack } from './ImportDialog.types';

export function useImportDialog({ open, code }: IImportDialogProps): IImportDialogView {
  const { t } = useTranslation('share');
  const {
    state,
    data,
    progress,
    total,
    playlistName,
    setPlaylistName,
    error,
    loadShare,
    startImport,
  } = useShareImport();

  useEffect(() => {
    if (!open) return;
    return loadShare(code);
  }, [open, code, loadShare]);

  const tracks: IImportTrack[] =
    data?.type === 'PLAYLIST'
      ? data.payload.tracks
      : data
        ? [{ title: data.payload.title, artist: data.payload.artist, ytId: data.payload.ytId }]
        : [];

  const progressWidth = total > 0 ? `${(progress / total) * 100}%` : '0%';

  return {
    t,
    state,
    data,
    progress,
    total,
    playlistName,
    setPlaylistName,
    error,
    tracks,
    isPlaylist: data?.type === 'PLAYLIST',
    progressWidth,
    startImport: () => {
      void startImport();
    },
  };
}
