import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { ListMusic, Plus, AlertCircle } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { Button } from '@/components/ui/button';
import { PlaylistsViewSkeleton } from './PlaylistsViewSkeleton';
import { GridSizeToggle } from '@/components/shared/GridSizeToggle';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePlaylistsQuery, useCreatePlaylistMutation } from '@/hooks/queries/usePlaylists';

export function PlaylistsView() {
  const { t } = useTranslation('playlists');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');
  const selectPlaylist = useViewStore(s => s.selectPlaylist);
  const { data: playlists = [], isLoading, isError, refetch } = usePlaylistsQuery();
  const createPlaylist = useCreatePlaylistMutation();
  const playlistGridSize = useUIStore(s => s.playlistGridSize);
  const setPlaylistGridSize = useUIStore(s => s.setPlaylistGridSize);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');

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
      if (e.key === 'Escape') {
        setShowNewForm(false);
        setNewName('');
      }
    },
    [handleCreate]
  );

  const gridClassName = useMemo(() => {
    switch (playlistGridSize) {
      case 'small':
        return 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2';
      case 'large':
        return 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4';
      case 'medium':
      default:
        return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3';
    }
  }, [playlistGridSize]);

  const cardPaddingClass = playlistGridSize === 'small' ? 'p-3' : 'p-4';

  if (isLoading) {
    return <PlaylistsViewSkeleton />;
  }

  if (isError) {
    return (
      <ViewEmptyState
        variant="error"
        title={t('errorTitle')}
        subtitle={t('errorSubtitle')}
        icon={AlertCircle}
        action={{
          label: tCommon('retry'),
          onClick: () => {
            void refetch();
          },
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-2 pb-4 shrink-0 flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('newPlaylist')}
        </motion.button>

        <div className="flex-1" />

        <GridSizeToggle
          size={playlistGridSize}
          onSizeChange={setPlaylistGridSize}
          labels={{
            group: t('gridSize'),
            small: t('gridSizeSmall'),
            medium: t('gridSizeMedium'),
            large: t('gridSizeLarge'),
          }}
        />
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
                disabled={createPlaylist.isPending}
              />
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newName.trim() || createPlaylist.isPending}
                className="h-7 rounded-lg bg-primary/20 px-3 text-primary shadow-none hover:bg-primary/30"
              >
                {createPlaylist.isPending ? t('creating') : t('create')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewForm(false);
                  setNewName('');
                }}
                className="h-7 rounded-lg px-2 text-muted-foreground"
              >
                {t('cancel', { ns: 'common' })}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist grid or empty state */}
      {playlists.length === 0 ? (
        <ViewEmptyState
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          icon={ListMusic}
          hints={[{ icon: Plus, label: t('emptyHintCreate') }]}
        />
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
          <motion.div
            className={gridClassName}
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
                className={cn(
                  'text-left rounded-2xl bg-surface/60 border border-border/30 hover:border-border/60 hover:bg-surface transition-all duration-200 group',
                  cardPaddingClass
                )}
              >
                <div className="w-full aspect-square rounded-xl bg-muted/30 flex items-center justify-center mb-3 overflow-hidden">
                  {playlist.coverArt ? (
                    <img
                      src={playlist.coverArt}
                      alt={playlist.name}
                      className="w-full h-full object-cover"
                    />
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
