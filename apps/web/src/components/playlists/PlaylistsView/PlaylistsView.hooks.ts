import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { usePlaylistsQuery, useCreatePlaylistMutation } from '@/hooks/queries/usePlaylists';
import type { IPlaylistsViewView } from './PlaylistsView.types';

function gridClassFor(size: 'small' | 'medium' | 'large'): string {
  switch (size) {
    case 'small':
      return 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2';
    case 'large':
      return 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4';
    case 'medium':
    default:
      return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3';
  }
}

export function usePlaylistsView(): IPlaylistsViewView {
  const { t } = useTranslation('playlists');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');
  const selectPlaylist = useViewStore(s => s.selectPlaylist);
  const { data: playlists = [], isLoading, isError, refetch } = usePlaylistsQuery();
  const createPlaylist = useCreatePlaylistMutation();
  const gridSize = useUIStore(s => s.playlistGridSize);
  const setGridSize = useUIStore(s => s.setPlaylistGridSize);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');

  const closeNewForm = useCallback(() => {
    setShowNewForm(false);
    setNewName('');
  }, []);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const playlist = await createPlaylist.mutateAsync({ name });
      setNewName('');
      setShowNewForm(false);
      toast.success(tToast('createdPlaylist', { name: playlist.name }));
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
    }
  }, [newName, createPlaylist, tToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCreate();
      if (e.key === 'Escape') closeNewForm();
    },
    [handleCreate, closeNewForm]
  );

  const gridClassName = useMemo(() => gridClassFor(gridSize), [gridSize]);
  const cardPaddingClass = gridSize === 'small' ? 'p-3' : 'p-4';

  return {
    t,
    tCommon,
    playlists,
    isLoading,
    isError,
    isEmpty: playlists.length === 0,
    gridSize,
    setGridSize,
    gridClassName,
    cardPaddingClass,
    showNewForm,
    openNewForm: () => setShowNewForm(true),
    closeNewForm,
    newName,
    setNewName,
    isCreating: createPlaylist.isPending,
    canCreate: newName.trim().length > 0 && !createPlaylist.isPending,
    onCreate: handleCreate,
    onNameKeyDown: handleKeyDown,
    onSelectPlaylist: selectPlaylist,
    onRetry: () => {
      void refetch();
    },
  };
}
