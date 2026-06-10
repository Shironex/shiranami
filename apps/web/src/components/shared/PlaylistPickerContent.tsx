import { useState, useCallback, useMemo } from 'react';
import { ListPlus, Check, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Playlist } from '@/types/electron';
import {
  usePlaylistsQuery,
  useCreatePlaylistMutation,
  useAddTrackToPlaylistMutation,
  useRemoveTrackFromPlaylistMutation,
  useTrackPlaylistMembershipQuery,
} from '@/hooks/queries/usePlaylists';

interface PlaylistPickerContentProps {
  trackIds: string[];
  onDone: () => void;
  toastMode?: 'single' | 'bulk';
}

export function PlaylistPickerContent({ trackIds, onDone, toastMode }: PlaylistPickerContentProps) {
  const { t: tToast } = useTranslation('toast');
  const { t: tCommon } = useTranslation('common');
  const { data: playlists = [], isLoading } = usePlaylistsQuery();
  const { data: memberPlaylistIds = [] } = useTrackPlaylistMembershipQuery(trackIds);
  const addTrackMutation = useAddTrackToPlaylistMutation();
  const removeTrackMutation = useRemoveTrackFromPlaylistMutation();
  const createPlaylistMutation = useCreatePlaylistMutation();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');

  const memberSet = useMemo(() => new Set(memberPlaylistIds), [memberPlaylistIds]);
  const isBulk = toastMode === 'bulk' || (toastMode == null && trackIds.length > 1);
  // Any in-flight membership change: rows go non-interactive so a second click
  // doesn't queue a conflicting add/remove before the first resolves.
  const isMutating =
    addTrackMutation.isPending || removeTrackMutation.isPending || createPlaylistMutation.isPending;

  const handleToggle = useCallback(
    async (playlist: Playlist) => {
      const isInPlaylist = memberSet.has(playlist.id);

      if (isInPlaylist) {
        try {
          await removeTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
          if (isBulk) {
            toast.success(
              tToast('removedTracksFromPlaylist', { count: trackIds.length, name: playlist.name })
            );
          } else {
            toast.success(tToast('removedFromPlaylist', { name: playlist.name }));
          }
          onDone();
        } catch {
          toast.error(tToast('failedRemoveFromPlaylist'));
        }
      } else {
        try {
          await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
          if (isBulk) {
            toast.success(
              tToast('addedTracksToPlaylist', { count: trackIds.length, name: playlist.name })
            );
          } else {
            toast.success(tToast('addedToPlaylist', { name: playlist.name }));
          }
          onDone();
        } catch {
          toast.error(tToast('failedAddToPlaylist'));
        }
      }
    },
    [trackIds, isBulk, memberSet, addTrackMutation, removeTrackMutation, onDone, tToast]
  );

  const handleCreateAndAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    // Create isn't idempotent — a double Enter/click would otherwise make two
    // playlists. Block re-entry while either mutation is in flight.
    if (createPlaylistMutation.isPending || addTrackMutation.isPending) return;

    let playlist: Playlist;
    try {
      playlist = await createPlaylistMutation.mutateAsync({ name });
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
      return;
    }

    // The playlist now exists; if only the track-add fails, tell the truth so
    // the user doesn't think nothing was created and retry into a duplicate.
    try {
      await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
      if (isBulk) {
        toast.success(
          tToast('createdPlaylistAddedTracks', { name: playlist.name, count: trackIds.length })
        );
      } else {
        toast.success(tToast('createdPlaylistAdded', { name: playlist.name }));
      }
      onDone();
    } catch {
      toast.error(tToast('createdPlaylistAddFailed', { name: playlist.name }));
      onDone();
    }
  }, [newName, trackIds, isBulk, createPlaylistMutation, addTrackMutation, onDone, tToast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 className="w-4 h-4 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="max-h-40 overflow-y-auto scrollbar-thin">
        {playlists.length === 0 && !showNewForm && (
          <p className="px-3 py-2 text-xs text-muted-foreground/50">{tCommon('noPlaylists')}</p>
        )}
        {playlists.map(pl => {
          const isInPlaylist = memberSet.has(pl.id);
          return (
            <button
              key={pl.id}
              onClick={e => {
                e.stopPropagation();
                handleToggle(pl);
              }}
              disabled={isMutating}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left disabled:pointer-events-none ${
                isInPlaylist
                  ? 'text-primary/80 hover:text-primary hover:bg-accent'
                  : 'text-foreground/80 hover:text-foreground hover:bg-accent'
              }`}
            >
              {isInPlaylist ? (
                <Check className="w-3 h-3 text-primary shrink-0" />
              ) : (
                <ListPlus className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              )}
              <span className="truncate">{pl.name}</span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-border/30 mt-1 pt-1">
        {showNewForm ? (
          <div className="px-2 py-1 flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') handleCreateAndAdd();
                if (e.key === 'Escape') {
                  setShowNewForm(false);
                  setNewName('');
                }
              }}
              onClick={e => e.stopPropagation()}
              placeholder={tCommon('namePlaceholder')}
              aria-label={tCommon('namePlaceholder')}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none min-w-0"
            />
            <Button
              size="sm"
              onClick={e => {
                e.stopPropagation();
                handleCreateAndAdd();
              }}
              disabled={!newName.trim() || isMutating}
              className="h-auto rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary shadow-none hover:bg-primary/30"
            >
              {tCommon('add')}
            </Button>
          </div>
        ) : (
          <button
            onClick={e => {
              e.stopPropagation();
              setShowNewForm(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary/80 hover:text-primary hover:bg-accent transition-colors"
          >
            <Plus className="w-3 h-3" />
            {tCommon('newPlaylist')}
          </button>
        )}
      </div>
    </>
  );
}
