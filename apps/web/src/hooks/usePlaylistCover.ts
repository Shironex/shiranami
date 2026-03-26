import { useState, useCallback, useRef } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import { notifyPlaylistsChanged } from '@/lib/playlists';

interface UsePlaylistCoverOptions {
  playlistId: string | null;
  setPlaylist: React.Dispatch<React.SetStateAction<Playlist | null>>;
  suggestedCoverArt?: string;
}

/**
 * Manages playlist cover art: update, upload from file, use suggested, clear.
 */
export function usePlaylistCover({
  playlistId,
  setPlaylist,
  suggestedCoverArt,
}: UsePlaylistCoverOptions) {
  const { t: tToast } = useTranslation('toast');
  const [showCoverMenu, setShowCoverMenu] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const coverMenuRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const updateCoverArt = useCallback(
    async (coverArt: string) => {
      if (!IS_ELECTRON || !playlistId) return;
      setIsUpdatingCover(true);
      try {
        await window.electronAPI.db.playlists.update(playlistId, { coverArt });
        setPlaylist((prev) => (prev ? { ...prev, coverArt } : prev));
        notifyPlaylistsChanged();
        setShowCoverMenu(false);
        toast.success(coverArt ? tToast('coverUpdated') : tToast('coverCleared'));
      } catch {
        toast.error(tToast('failedUpdateCover'));
      } finally {
        setIsUpdatingCover(false);
      }
    },
    [playlistId, setPlaylist, tToast]
  );

  const handleCoverFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) {
          toast.error(tToast('failedReadImage'));
          return;
        }
        await updateCoverArt(result);
      };
      reader.onerror = () => {
        toast.error(tToast('failedReadImage'));
      };
      reader.readAsDataURL(file);
    },
    [updateCoverArt, tToast]
  );

  const handlePickCustomCover = useCallback(() => {
    coverInputRef.current?.click();
  }, []);

  const handleUseSuggestedCover = useCallback(async () => {
    if (!suggestedCoverArt) return;
    await updateCoverArt(suggestedCoverArt);
  }, [suggestedCoverArt, updateCoverArt]);

  const handleClearCover = useCallback(async () => {
    await updateCoverArt('');
  }, [updateCoverArt]);

  return {
    showCoverMenu,
    setShowCoverMenu,
    isUpdatingCover,
    coverMenuRef,
    coverInputRef,
    handleCoverFileSelected,
    handlePickCustomCover,
    handleUseSuggestedCover,
    handleClearCover,
  };
}
