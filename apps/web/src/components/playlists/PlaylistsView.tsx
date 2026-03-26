import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { useAppStore } from '@/stores/useAppStore';
import { ListMusic, Plus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { Playlist } from '@/types/electron';
import { notifyPlaylistsChanged } from '@/lib/playlists';

export function PlaylistsView() {
  const { t } = useTranslation('playlists');
  const { t: tToast } = useTranslation('toast');
  const selectPlaylist = useAppStore(s => s.selectPlaylist);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadPlaylists = useCallback(async () => {
    if (!IS_ELECTRON) {
      setIsLoading(false);
      return;
    }
    try {
      const result = (await window.electronAPI.db.playlists.getAll()) as Playlist[];
      setPlaylists(result);
    } catch {
      toast.error(tToast('failedLoadPlaylists'));
    } finally {
      setIsLoading(false);
    }
  }, [tToast]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || !IS_ELECTRON) return;
    setIsCreating(true);
    try {
      const playlist = (await window.electronAPI.db.playlists.create({ name })) as Playlist;
      setPlaylists(prev => [playlist, ...prev]);
      notifyPlaylistsChanged();
      setNewName('');
      setShowNewForm(false);
      toast.success(tToast('createdPlaylist', { name: playlist.name }));
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
    } finally {
      setIsCreating(false);
    }
  }, [newName, tToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCreate();
      if (e.key === 'Escape') {
        setShowNewForm(false);
        setNewName('');
      }
    },
    [handleCreate]
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-2 pb-4 shrink-0 flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('newPlaylist')}
        </motion.button>
      </div>

      {/* Inline create form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="px-6 pb-4 shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 p-3 rounded-xl bg-surface border border-border/50">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('namePlaceholder')}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                disabled={isCreating}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isCreating}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
              >
                {isCreating ? t('creating') : t('create')}
              </button>
              <button
                onClick={() => {
                  setShowNewForm(false);
                  setNewName('');
                }}
                className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('cancel', { ns: 'common' })}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist grid or empty state */}
      {playlists.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <ListMusic className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base font-medium text-muted-foreground">
              {t('emptyTitle')}
            </p>
            <p className="text-sm text-muted-foreground/50 mt-1">{t('emptySubtitle')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-3 gap-3"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.04 } },
            }}
          >
            {playlists.map(playlist => (
              <motion.button
                key={playlist.id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectPlaylist(playlist.id)}
                className="text-left p-4 rounded-2xl bg-surface/60 border border-border/30 hover:border-border/60 hover:bg-surface transition-all duration-200 group"
              >
                <div className="w-full aspect-square rounded-xl bg-muted/30 flex items-center justify-center mb-3 overflow-hidden">
                  {playlist.coverArt ? (
                    <img src={playlist.coverArt} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ListMusic className="w-10 h-10 text-muted-foreground/20 group-hover:text-muted-foreground/30 transition-colors" />
                  )}
                </div>
                <p className="font-display text-sm font-semibold text-foreground truncate">
                  {playlist.name}
                </p>
                {playlist.description && (
                  <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
                    {playlist.description}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/30 mt-1.5">
                  {new Date(playlist.createdAt).toLocaleDateString()}
                </p>
              </motion.button>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
