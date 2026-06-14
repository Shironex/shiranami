import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '@/stores/useViewStore';
import { useSmartPlaylistsQuery } from '@/hooks/queries/useSmartPlaylists';
import type { ISmartPlaylistsViewView } from './SmartPlaylistsView.types';

export function useSmartPlaylistsView(): ISmartPlaylistsViewView {
  const { t } = useTranslation('smartPlaylists');
  const { t: tCommon } = useTranslation('common');
  const selectedId = useViewStore(s => s.selectedSmartPlaylistId);
  const selectSmartPlaylist = useViewStore(s => s.selectSmartPlaylist);
  const { data: playlists = [], isLoading, isError, refetch } = useSmartPlaylistsQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const onOpen = useCallback((id: string) => selectSmartPlaylist(id), [selectSmartPlaylist]);

  const sorted = useMemo(
    () => [...playlists].sort((a, b) => a.name.localeCompare(b.name)),
    [playlists]
  );

  return {
    t,
    selectedId,
    showSkeleton: isLoading,
    showError: isError,
    retryLabel: tCommon('retry'),
    isEmpty: sorted.length === 0,
    sorted,
    createOpen,
    setCreateOpen,
    onOpen,
    onCreate: () => setCreateOpen(true),
    onRetry: () => {
      void refetch();
    },
  };
}
