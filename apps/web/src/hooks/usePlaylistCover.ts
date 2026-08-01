import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useUpdatePlaylistMutation } from '@/hooks/queries/usePlaylists';

interface UsePlaylistCoverOptions {
  playlistId: string | null;
  suggestedCoverArt?: string;
}

/**
 * Manages playlist cover art using TanStack Query mutations.
 */
export function usePlaylistCover({ playlistId, suggestedCoverArt }: UsePlaylistCoverOptions) {
  const { t: tToast } = useTranslation('toast');
  const [showCoverMenu, setShowCoverMenu] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const coverMenuRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const updateMutation = useUpdatePlaylistMutation();

  const updateCoverArt = useCallback(
    async (coverArt: string) => {
      if (!playlistId) return;
      setIsUpdatingCover(true);
      try {
        await updateMutation.mutateAsync({ id: playlistId, data: { coverArt } });
        setShowCoverMenu(false);
        toast.success(coverArt ? tToast('coverUpdated') : tToast('coverCleared'));
      } catch {
        toast.error(tToast('failedUpdateCover'));
      } finally {
        setIsUpdatingCover(false);
      }
    },
    [playlistId, updateMutation, tToast]
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
