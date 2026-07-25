import { ArrowLeft, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { IconButton } from '@/components/ui/icon-button';
import { SmartPlaylistFormDialog } from '../../SmartPlaylistFormDialog';
import { useSmartPlaylistDetail } from './SmartPlaylistDetail.hooks';
import type { ISmartPlaylistDetailProps } from './SmartPlaylistDetail.types';

export default function SmartPlaylistDetail(props: ISmartPlaylistDetailProps) {
  const {
    t,
    tCommon,
    playlist,
    showMetaLoader,
    showTracksLoader,
    matchCountLabel,
    hasNoTracks,
    rowCount,
    rowProps,
    deleteRef,
    showDeleteConfirm,
    isDeleting,
    editOpen,
    setEditOpen,
    onEdit,
    onToggleDeleteConfirm,
    onCancelDelete,
    onDelete,
    onBack,
  } = useSmartPlaylistDetail(props);

  if (showMetaLoader) {
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
        <button onClick={onBack} className="text-xs text-primary hover:underline">
          {t('goBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/30 shrink-0">
        <IconButton size="md" onClick={onBack} aria-label={t('goBack')} title={t('goBack')}>
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif italic text-xl leading-tight text-foreground truncate">
            {playlist.name}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mt-0.5">
            {matchCountLabel}
          </p>
        </div>
        <IconButton size="md" onClick={onEdit} aria-label={tCommon('edit')} title={tCommon('edit')}>
          <Pencil />
        </IconButton>
        <div ref={deleteRef} className="relative">
          <IconButton
            size="md"
            onClick={onToggleDeleteConfirm}
            aria-label={tCommon('delete')}
            title={tCommon('delete')}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </IconButton>
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
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50"
                  >
                    {tCommon('delete')}
                  </button>
                  <button
                    onClick={onCancelDelete}
                    className="flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    {tCommon('cancel')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {showTracksLoader ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
        </div>
      ) : hasNoTracks ? (
        <ViewEmptyState title={t('emptyTitle')} subtitle={t('emptySubtitle')} icon={Sparkles} />
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="h-full px-2 py-1.5">
            <List
              rowCount={rowCount}
              rowHeight={52}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={TrackRow}
              rowProps={rowProps}
            />
          </div>
        </div>
      )}

      <SmartPlaylistFormDialog open={editOpen} onOpenChange={setEditOpen} playlist={playlist} />
    </div>
  );
}
