import { ListMusic, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SCALE_CARD } from '@/lib/motion';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { GridSizeToggle } from '@/components/shared/GridSizeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePlaylistsView } from './PlaylistsView.hooks';
import { PlaylistsViewSkeleton } from './PlaylistsViewSkeleton';

export default function PlaylistsView() {
  const {
    t,
    tCommon,
    playlists,
    isLoading,
    isError,
    isEmpty,
    gridSize,
    setGridSize,
    gridClassName,
    cardPaddingClass,
    showNewForm,
    openNewForm,
    closeNewForm,
    newName,
    setNewName,
    isCreating,
    canCreate,
    onCreate,
    onNameKeyDown,
    onSelectPlaylist,
    onRetry,
  } = usePlaylistsView();

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
        action={{ label: tCommon('retry'), onClick: onRetry }}
      />
    );
  }

  const cards = playlists.map(playlist => (
    <motion.button
      key={playlist.id}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{ scale: 1.02 }}
      whileTap={SCALE_CARD}
      onClick={() => onSelectPlaylist(playlist.id)}
      className={cn(
        'text-left rounded-2xl bg-surface/60 border border-border/30 hover:border-border/60 hover:bg-surface transition-all duration-200 group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        cardPaddingClass
      )}
    >
      <div className="w-full aspect-square rounded-xl bg-muted/30 flex items-center justify-center mb-3 overflow-hidden">
        {playlist.coverArt ? (
          <img
            src={playlist.coverArt}
            alt={playlist.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <ListMusic className="w-10 h-10 text-muted-foreground/20 group-hover:text-muted-foreground/30 transition-colors" />
        )}
      </div>
      <p className="font-display text-sm font-semibold text-foreground truncate">{playlist.name}</p>
      {playlist.description && (
        <p className="text-xs text-muted-foreground/50 truncate mt-0.5">{playlist.description}</p>
      )}
      <p className="text-[10px] text-muted-foreground/30 mt-1.5">
        {new Date(playlist.createdAt).toLocaleDateString()}
      </p>
    </motion.button>
  ));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('pageTitle')} />

      {/* Header */}
      <div className="px-6 pt-4 pb-4 shrink-0 flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={openNewForm}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('newPlaylist')}
        </motion.button>

        <div className="flex-1" />

        <GridSizeToggle
          size={gridSize}
          onSizeChange={setGridSize}
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
                onKeyDown={onNameKeyDown}
                placeholder={t('namePlaceholder')}
                aria-label={t('namePlaceholder')}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                disabled={isCreating}
              />
              <Button
                size="sm"
                onClick={onCreate}
                disabled={!canCreate}
                className="h-7 rounded-lg bg-primary/20 px-3 text-primary shadow-none hover:bg-primary/30 [&_svg]:size-3.5"
              >
                {isCreating && <Loader2 className="animate-spin" />}
                {isCreating ? t('creating') : t('create')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeNewForm}
                className="h-7 rounded-lg px-2 text-muted-foreground"
              >
                {tCommon('cancel')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist grid or empty state */}
      {isEmpty ? (
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
            {cards}
          </motion.div>
        </div>
      )}
    </div>
  );
}
