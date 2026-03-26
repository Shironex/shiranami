import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { useAppStore } from '@/stores/useAppStore';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import {
  ArrowLeft,
  Play,
  Share2,
  Trash2,
  ListMusic,
  Loader2,
  ImagePlus,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { toast } from 'sonner';
import type { Playlist } from '@/types/electron';
import { notifyPlaylistsChanged } from '@/lib/playlists';

export function PlaylistDetailView() {
  const { t } = useTranslation('playlists');
  const { t: tToast } = useTranslation('toast');
  const selectedPlaylistId = useAppStore(s => s.selectedPlaylistId);
  const selectPlaylist = useAppStore(s => s.selectPlaylist);
  const setQueue = usePlayerStore(s => s.setQueue);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const library = usePlayerStore(s => s.library);

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCoverMenu, setShowCoverMenu] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const coverMenuRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const suggestedCoverArt = tracks.find(track => track.albumArt)?.albumArt;

  // Sync isFavorite from the store so hearts update in real-time
  const displayTracks = useMemo(() => {
    const favMap = new Map(library.map(t => [t.id, t.isFavorite]));
    return tracks.map(t => {
      const fav = favMap.get(t.id);
      return fav !== undefined && fav !== t.isFavorite ? { ...t, isFavorite: fav } : t;
    });
  }, [tracks, library]);

  const loadPlaylist = useCallback(async () => {
    if (!IS_ELECTRON || !selectedPlaylistId) return;
    setIsLoading(true);
    try {
      const [pl, tr] = await Promise.all([
        window.electronAPI.db.playlists.get(selectedPlaylistId) as Promise<Playlist>,
        window.electronAPI.db.playlists.getTracks(selectedPlaylistId) as Promise<Track[]>,
      ]);
      setPlaylist(pl);
      setTracks(tr);
    } catch {
      toast.error(tToast('failedLoadPlaylist'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedPlaylistId, tToast]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  useEffect(() => {
    if (!showCoverMenu) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (coverMenuRef.current && !coverMenuRef.current.contains(event.target as Node)) {
        setShowCoverMenu(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showCoverMenu]);

  const handleBack = useCallback(() => selectPlaylist(null), [selectPlaylist]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    setQueue(tracks, 0);
  }, [tracks, setQueue]);

  const handlePlayTrack = useCallback(
    (index: number) => {
      if (tracks.length === 0) return;
      setQueue(tracks, index);
    },
    [tracks, setQueue]
  );

  const handleRemoveTrack = useCallback(
    async (trackId: string) => {
      if (!IS_ELECTRON || !selectedPlaylistId) return;
      try {
        await window.electronAPI.db.playlists.removeTrack(selectedPlaylistId, trackId);
        setTracks(prev => prev.filter(t => t.id !== trackId));
        toast.success(tToast('removedFromPlaylist'));
      } catch {
        toast.error(tToast('failedRemoveTrack'));
      }
    },
    [selectedPlaylistId, tToast]
  );

  const handleStartEdit = useCallback(() => {
    if (!playlist) return;
    setEditName(playlist.name);
    setIsEditing(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [playlist]);

  const handleSaveName = useCallback(async () => {
    const name = editName.trim();
    if (!name || !IS_ELECTRON || !selectedPlaylistId || !playlist) {
      setIsEditing(false);
      return;
    }
    if (name === playlist.name) {
      setIsEditing(false);
      return;
    }
    try {
      await window.electronAPI.db.playlists.update(selectedPlaylistId, { name });
      setPlaylist(prev => (prev ? { ...prev, name } : prev));
      notifyPlaylistsChanged();
      toast.success(tToast('playlistRenamed'));
    } catch {
      toast.error(tToast('failedRename'));
    } finally {
      setIsEditing(false);
    }
  }, [editName, selectedPlaylistId, playlist, tToast]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSaveName();
      if (e.key === 'Escape') setIsEditing(false);
    },
    [handleSaveName]
  );

  const handleDelete = useCallback(async () => {
    if (!IS_ELECTRON || !selectedPlaylistId) return;
    try {
      await window.electronAPI.db.playlists.delete(selectedPlaylistId);
      notifyPlaylistsChanged();
      toast.success(tToast('playlistDeleted'));
      selectPlaylist(null);
    } catch {
      toast.error(tToast('failedDeletePlaylist'));
    }
  }, [selectedPlaylistId, selectPlaylist, tToast]);

  const updateCoverArt = useCallback(
    async (coverArt: string) => {
      if (!IS_ELECTRON || !selectedPlaylistId) return;

      setIsUpdatingCover(true);
      try {
        await window.electronAPI.db.playlists.update(selectedPlaylistId, { coverArt });
        setPlaylist(prev => (prev ? { ...prev, coverArt } : prev));
        notifyPlaylistsChanged();
        setShowCoverMenu(false);
        toast.success(coverArt ? tToast('coverUpdated') : tToast('coverCleared'));
      } catch {
        toast.error(tToast('failedUpdateCover'));
      } finally {
        setIsUpdatingCover(false);
      }
    },
    [selectedPlaylistId, tToast]
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <button onClick={handleBack} className="text-xs text-primary hover:underline">
          {t('goBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-2 pb-4 shrink-0 space-y-3">
        {/* Back + actions row */}
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleBack}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t('back')}
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>

          <div className="flex-1" />

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {t('playAll')}
          </motion.button>

          {IS_ELECTRON && selectedPlaylistId && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-share-dialog', {
                  detail: { type: 'playlist', id: selectedPlaylistId }
                }));
              }}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
              aria-label={t('share', { ns: 'share' })}
            >
              <Share2 className="w-3.5 h-3.5" />
            </motion.button>
          )}

          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label={t('deletePlaylist')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>

            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-52 p-3 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
                >
                  <p className="text-xs text-foreground/80 mb-2">{t('deleteConfirm')}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                    >
                      {t('delete', { ns: 'common' })}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      {t('cancel', { ns: 'common' })}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Playlist info */}
        <div className="flex items-center gap-4">
          <div ref={coverMenuRef} className="relative shrink-0">
            <button
              onClick={() => setShowCoverMenu(open => !open)}
              className="group/cover relative w-16 h-16 rounded-xl bg-surface border border-border/30 flex items-center justify-center overflow-hidden"
              disabled={isUpdatingCover}
              title={t('editCover')}
            >
              {playlist.coverArt ? (
                <img src={playlist.coverArt} alt="" className="w-full h-full object-cover" />
              ) : (
                <ListMusic className="w-7 h-7 text-muted-foreground/20" />
              )}

              <div className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/30 transition-colors flex items-center justify-center">
                {isUpdatingCover ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity" />
                )}
              </div>
            </button>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleCoverFileSelected}
            />

            <AnimatePresence>
              {showCoverMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-52 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
                >
                  <button
                    onClick={handlePickCustomCover}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <ImagePlus className="w-4 h-4 text-muted-foreground/60" />
                    {t('uploadCustomImage')}
                  </button>

                  {suggestedCoverArt && (
                    <button
                      onClick={handleUseSuggestedCover}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Sparkles className="w-4 h-4 text-muted-foreground/60" />
                      {t('useTrackArtwork')}
                    </button>
                  )}

                  {playlist.coverArt && (
                    <button
                      onClick={handleClearCover}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      {t('removeCover')}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                ref={nameInputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={handleNameKeyDown}
                className="font-display text-lg font-semibold text-foreground bg-transparent outline-none border-b border-primary/40 w-full pb-0.5"
              />
            ) : (
              <button
                onClick={handleStartEdit}
                className="font-display text-lg font-semibold text-foreground truncate block text-left hover:text-primary transition-colors"
                title={t('clickToRename')}
              >
                {playlist.name}
              </button>
            )}
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {t('trackCount', { count: tracks.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Track list */}
      {tracks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <ListMusic className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base font-medium text-muted-foreground">
              {t('detailEmptyTitle')}
            </p>
            <p className="text-sm text-muted-foreground/50 mt-1">{t('detailEmptySubtitle')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4">
          <List
            rowCount={displayTracks.length}
            rowHeight={52}
            overscanCount={10}
            className="scrollbar-thin"
            style={{ height: '100%' }}
            rowComponent={TrackRow}
            rowProps={{
              queue: displayTracks,
              currentTrack,
              isPlaying,
              handlePlayTrack,
              onToggleFavorite: toggleFavorite,
              onRemoveFromPlaylist: handleRemoveTrack,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default PlaylistDetailView;
