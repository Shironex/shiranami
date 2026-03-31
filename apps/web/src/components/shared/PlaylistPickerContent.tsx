import { useState, useCallback } from 'react';
import { ListPlus, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import {
  usePlaylistsQuery,
  useCreatePlaylistMutation,
  useAddTrackToPlaylistMutation,
} from '@/hooks/queries/usePlaylists';

interface PlaylistPickerContentProps {
  trackIds: string[];
  onDone: () => void;
  toastMode?: 'single' | 'bulk';
}

export function PlaylistPickerContent({
  trackIds,
  onDone,
  toastMode,
}: PlaylistPickerContentProps) {
  const { t: tToast } = useTranslation('toast');
  const { t: tCommon } = useTranslation('common');
  const { data: playlists = [], isLoading } = usePlaylistsQuery();
  const addTrackMutation = useAddTrackToPlaylistMutation();
  const createPlaylistMutation = useCreatePlaylistMutation();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');

  const isBulk = toastMode === 'bulk' || (toastMode == null && trackIds.length > 1);

  const handleAdd = useCallback(async (playlist: Playlist) => {
    try {
      await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
      if (isBulk) {
        toast.success(tToast('addedTracksToPlaylist', { count: trackIds.length, name: playlist.name }));
      } else {
        toast.success(tToast('addedToPlaylist', { name: playlist.name }));
      }
      onDone();
    } catch {
      toast.error(tToast('failedAddToPlaylist'));
    }
  }, [trackIds, isBulk, addTrackMutation, onDone, tToast]);

  const handleCreateAndAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const playlist = await createPlaylistMutation.mutateAsync({ name });
      await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
      if (isBulk) {
        toast.success(tToast('createdPlaylistAddedTracks', { name: playlist.name, count: trackIds.length }));
      } else {
        toast.success(tToast('createdPlaylistAdded', { name: playlist.name }));
      }
      onDone();
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
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
        {playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={(e) => { e.stopPropagation(); handleAdd(pl); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:bg-accent transition-colors text-left"
          >
            <ListPlus className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            <span className="truncate">{pl.name}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-border/30 mt-1 pt-1">
        {showNewForm ? (
          <div className="px-2 py-1 flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleCreateAndAdd();
                if (e.key === 'Escape') {
                  setShowNewForm(false);
                  setNewName('');
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder={tCommon('namePlaceholder')}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none min-w-0"
            />
            <button
              onClick={(e) => { e.stopPropagation(); handleCreateAndAdd(); }}
              disabled={!newName.trim()}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
            >
              {tCommon('add')}
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowNewForm(true); }}
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
